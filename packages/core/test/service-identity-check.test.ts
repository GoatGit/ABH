import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import type {GrantRecord} from '@abh/contracts';
import {PgBossDeliveryAdapter} from '@abh/adapter-pg-boss';
import {QueueAdmissionDirectory} from '../src/durable/queue-admission.ts';
import {EventEmitter} from 'node:events';
import {createHttpApp} from '@abh/adapter-fastify';
import {Database} from '../src/data/uow.ts';
import {IdentityIngress} from '../src/identity/ingress.ts';
import {inputDigest} from '../src/data/journal.ts';
import {runHttpService,StartupCheckError} from '../src/server/service.ts';
import {createDatabaseFixture,context,options} from './database-fixture.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import {serviceIdentityCheck} from '../src/server/service-identity-check.ts';

test('service startup identity check reads actual membership, revocation and fixed installed identity',async t=>{
  const f=await createDatabaseFixture();t.after(()=>f.close());
  const seed=context(),org=seed.tenant.resourceOrganizationId,id=seed.tenant.actor.id;
  const request={...seed.request,actor:{type:'Service' as const,id},authnStrength:{level:'Workload' as const},purposeOfUse:'abh.runtime.deliver'};
  await f.database.transaction(seed,options(),async tx=>{
    await tx.owner('Identity')`INSERT INTO identity.organizations (resource_organization_id,id,name,home_region,status) VALUES (${org},${org},'Fixture','local','Active')`;
    await tx.owner('Identity')`INSERT INTO identity.principals (resource_organization_id,id,display_name,identity_kind,credential_epoch,status) VALUES (${org},${id},'Service','Service',1,'Active')`;
    await tx.owner('Identity')`INSERT INTO identity.memberships (resource_organization_id,id,principal_id,membership_epoch,status) VALUES (${org},${randomUUID()},${id},1,'Active')`;
    await tx.owner('Control')`INSERT INTO control.fences (resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.organization',${org},1)`;
  });
  let current=deriveVerifiedContext(request);
  const check=serviceIdentityCheck(f.database,{name:'runtime.identity',organizationId:org,principalId:id,purpose:'abh.runtime.deliver',context:async received=>{assert.equal(received.readOnly,true);return current;}});
  await check.verify(options());
  for(const patch of [{actor:{type:'Human' as const,id}},{actor:{type:'Service' as const,id:randomUUID()}},{workspaceId:randomUUID()},{resourceOrganizationId:randomUUID(),workspaceId:randomUUID()},{actingOrganizationId:randomUUID(),workspaceId:randomUUID()},{purposeOfUse:'abh.action.execute'},{scopeEpoch:2}]){
    current=deriveVerifiedContext({...request,...patch});await assert.rejects(check.verify(options()));
  }
  current=deriveVerifiedContext(request);
  await f.admin`UPDATE identity.principals SET credential_epoch=2 WHERE resource_organization_id=${org} AND id=${id}`;
  await assert.rejects(check.verify(options()),{code:'EPOCH_REVOKED'});
  await f.admin`UPDATE identity.principals SET credential_epoch=1 WHERE resource_organization_id=${org} AND id=${id}`;
  await f.admin`UPDATE control.fences SET stop_flag=true WHERE resource_organization_id=${org}`;
  await assert.rejects(check.verify(options()),{code:'FORBIDDEN'});
  await f.admin`UPDATE control.fences SET stop_flag=false WHERE resource_organization_id=${org}`;
  await f.admin`UPDATE identity.memberships SET status='Revoked' WHERE resource_organization_id=${org}`;
  await assert.rejects(check.verify(options()),{code:'FORBIDDEN'});
  await assert.rejects(check.verify({...options(),signal:AbortSignal.abort()}),{code:'DEPENDENCY_TIMEOUT'});
  // Actual IdP Port → mapping → current Identity → startup check → HTTP/process service.
  const issuer='development.fake',audience='abh.startup',subject='fixture-service';
  const digest=await inputDigest([issuer,subject]);
  await f.admin`INSERT INTO deployment.identity_locations (identity_digest,resource_organization_id,principal_id,principal_version) VALUES (${digest},${org},${id},1)`;
  const ref=<T extends string>(type:T)=>({type,id:randomUUID(),version:1 as const});
  const grant:GrantRecord={grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:{type:'abh.principal',id,version:1},scopeRefs:[{type:'abh.organization',id:org,version:1}],
    actionTypes:['abh.runtime.drain'],purposeNames:['abh.runtime.deliver'],validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+60000).toISOString(),issuanceEvidenceRef:ref('abh.decision'),status:'Active'};
  await f.database.transaction(seed,options(),async tx=>{
    await tx.owner('Control')`INSERT INTO control.grants (resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${grant.grantRef.id},${id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
    for(const scope of [grant.grantRef,grant.principalRef])await tx.owner('Control')`INSERT INTO control.fences (resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},${scope.type},${scope.id},1)`;
  });
  for(const mode of ['revoked-member','active','revoked-drain'] as const){
    const allowed=mode!=='revoked-member';
    if(allowed)await f.admin`UPDATE identity.memberships SET status='Active' WHERE resource_organization_id=${org}`;
    const db=await Database.connect(f.runtimeUrl),events=new EventEmitter(),order:string[]=[];
    const ingress=new IdentityIngress(db,{verify:async()=>({status:'Completed',data:{issuer,audience,subject,identityKind:'Service',authnStrength:{level:'Workload'},credentialEpoch:1,
      verifiedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString(),evidenceRef:ref('abh.identity-evidence')}})},{issuer,audience});
    const startup=serviceIdentityCheck(db,{name:'runtime.identity',organizationId:org,principalId:id,purpose:'abh.runtime.deliver',
      context:options=>ingress.authenticate({credentialRef:ref('abh.credential'),organizationId:org,purpose:'abh.runtime.deliver'},options)});
    const directory=new QueueAdmissionDirectory(db,['hello.consumer']);
    const drain=directory.drainContexts({context:requestOptions=>ingress.authenticate({credentialRef:ref('abh.credential'),organizationId:org,purpose:'abh.runtime.deliver'},requestOptions),consumerId:'hello.consumer',grantRefs:[grant.grantRef],queueClasses:['control'],timeoutMs:1000});
    const queueErrors:string[]=[];
    const queue=await PgBossDeliveryAdapter.start({connectionString:f.queueUrl,admission:directory,onError:category=>queueErrors.push(category)});
    const app=createHttpApp({authenticate:async()=>{throw new Error('no business route installed');}});
    let bound=false;app.server.once('listening',()=>{bound=true;});
    const running=runHttpService({app,listen:{host:'127.0.0.1',port:0},signal:new AbortController().signal,database:db,startup:{checks:[startup]},
      loops:[async signal=>{order.push('worker');await new Promise<void>(resolve=>signal.addEventListener('abort',()=>resolve(),{once:true}));}],
      onListening:async address=>{order.push('listening');assert.equal((await fetch(address+'/missing')).status,404);if(mode==='revoked-drain')await f.admin`UPDATE control.grants SET status='Revoked' WHERE resource_organization_id=${org} AND id=${grant.grantRef.id}`;events.emit('SIGTERM');},
      drainRequest:async()=>{order.push('admit');return drain.drainRequest();},releaseDrainRequest:request=>drain.releaseDrainRequest?.(request),
      queue:{drain:async(request,options)=>{order.push('drain');return queue.drain(request,options);},close:async()=>{order.push('queue');await queue.close();}},
      recordDrain:async report=>{assert.equal(report.drained,true);assert.deepEqual(report.remainingRefs,[]);await db.verify();order.push('record');}},events);
    try{
      if(mode==='revoked-drain'){await assert.rejects(running,error=>{assert.ok(error instanceof AggregateError);assert.equal(error.cause,undefined);return true;});assert.equal(bound,true);assert.deepEqual(order,['worker','listening','admit','drain','queue']);}
      else if(allowed){await running;assert.equal(bound,true);assert.deepEqual(order,['worker','listening','admit','drain','record','queue']);}
      else await assert.rejects(running,error=>{
        assert.ok(error instanceof AggregateError);
        const checks=(value:unknown):StartupCheckError[]=>value instanceof StartupCheckError?[value]:value instanceof AggregateError?value.errors.flatMap(checks):[];
        assert.ok(checks(error).some(failure=>failure.checkName==='runtime.identity'&&(failure.cause as {code?:string}).code==='FORBIDDEN'));
        assert.equal(bound,false);assert.deepEqual(order,['admit','queue']);return true;
      });
      assert.equal(app.server.listening,false);assert.equal(events.listenerCount('SIGTERM'),0);assert.deepEqual(queueErrors,[]);
      await assert.rejects(db.transaction(current,options(),async()=>{}));
    }finally{await app.close();await queue.close();await db.close();}
  }

});
