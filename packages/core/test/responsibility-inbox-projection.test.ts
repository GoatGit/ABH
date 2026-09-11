import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import type {DecisionPackage,DecisionRecord,GrantRecord,ResponsibilityAssignmentRecord,
  ResponsibilityInboxProjection,
  ResponsibilityRequestRecord,SubmitDecisionPayload} from '@abh/contracts';
import {digestContract} from '@abh/contracts/digest';
import {Database} from '../src/data/uow.ts';
import {contract,inputDigest,type CommandIdentity} from '../src/data/journal.ts';
import {DecisionOwner,type DecisionEligibility} from '../src/human/decisions.ts';
import {assignResponsibility} from '../src/human/responsibilities.ts';
import {executeCommand} from '../src/data/journal.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import {runResponsibilityInboxProjectionWorker,subscribeResponsibilityInboxChanges,
  ResponsibilityInboxProjectionOwner} from '../src/workbench/responsibility-inbox-projection.ts';
import {createTenantRuntimeLoops,type TenantRuntimeOptions} from '../src/durable/runtime-host.ts';
import {context,createDatabaseFixture,options} from './database-fixture.ts';

const ref=<T extends string>(type:T,id:string=randomUUID(),version=1)=>({type,id,version});
const command=async(type:string,value:unknown):Promise<CommandIdentity>=>({type,commandId:randomUUID(),
  idempotencyKey:randomUUID(),digest:await inputDigest(value)});

test('responsibility inbox projection builds authorized durable changes and authorized subscriptions',
  {timeout:120_000},async t=>{
  const f=await createDatabaseFixture();t.after(()=>f.close());
  const db=await Database.connect(f.runtimeUrl,{max:4});t.after(()=>db.close());
  const reviewer=context(),org=reviewer.tenant.resourceOrganizationId;
  const review=deriveVerifiedContext({...reviewer.request,purposeOfUse:'abh.decision.review'});
  const serviceId=randomUUID(),service=deriveVerifiedContext({...reviewer.request,
    actor:{type:'Service',id:serviceId},purposeOfUse:'abh.runtime.deliver'});
  const scope={type:'abh.organization',id:org,version:1},principal={type:'abh.principal',id:serviceId,version:1};
  const runtimeGrant:GrantRecord=contract('GrantRecord',{grantRef:ref('abh.grant'),resourceOrganizationId:org,
    principalRef:principal,scopeRefs:[scope],actionTypes:['abh.runtime.consume-event','abh.runtime.drain',
      'abh.decisions.read','abh.projections.read'],
    purposeNames:['abh.runtime.deliver','abh.decision.review'],
    validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+60_000).toISOString(),
    issuanceEvidenceRef:scope,status:'Active'});
  const readGrant:GrantRecord=contract('GrantRecord',{grantRef:ref('abh.grant'),
    resourceOrganizationId:org,principalRef:{type:'abh.principal',id:reviewer.tenant.actor.id,version:1},
    scopeRefs:[scope],actionTypes:['abh.projections.read'],purposeNames:['abh.decision.review'],
    validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+60_000).toISOString(),
    issuanceEvidenceRef:scope,status:'Active'});
  await db.transaction(review,options(),async tx=>{
    await tx.owner('Identity')`INSERT INTO identity.organizations(resource_organization_id,id,name,home_region,status)
      VALUES (${org},${org},'Projection fixture','local','Active')`;
    await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status)
      VALUES (${org},${reviewer.tenant.actor.id},'Reviewer','Human',1,'Active'),(${org},${serviceId},'Projection Service','Service',1,'Active')`;
    await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status)
      VALUES (${org},${randomUUID()},${reviewer.tenant.actor.id},1,'Active'),(${org},${randomUUID()},${serviceId},1,'Active')`;
    await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status)
      VALUES (${org},${runtimeGrant.grantRef.id},${serviceId},${JSON.stringify(runtimeGrant)}::text::jsonb,
        ${runtimeGrant.validFrom},${runtimeGrant.validUntil},'Active'),
        (${org},${readGrant.grantRef.id},${reviewer.tenant.actor.id},${JSON.stringify(readGrant)}::text::jsonb,
        ${readGrant.validFrom},${readGrant.validUntil},'Active')`;
    for(const value of [scope,{type:'abh.principal',id:reviewer.tenant.actor.id,version:1},principal,
      runtimeGrant.grantRef,readGrant.grantRef])
      await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch)
        VALUES (${org},${randomUUID()},${value.type},${value.id},1)`;
  });

  const assignment:ResponsibilityAssignmentRecord={responsibilityRef:ref('abh.responsibility-assignment'),
    resourceOrganizationId:org,principalRef:{type:'abh.principal',id:reviewer.tenant.actor.id,version:1},
    responsibilityType:'Authorization',scopeRefs:[scope],validFrom:new Date(Date.now()-1000).toISOString(),
    validUntil:new Date(Date.now()+60_000).toISOString(),templateRef:ref('abh.artifact'),status:'Active'};
  const assignCommand=await command('abh.responsibilities.assign',assignment);
  await db.transaction(review,options(),tx=>executeCommand(tx,assignCommand,async()=>{},
    ()=>assignResponsibility(tx,assignCommand,assignment)));
  const request:ResponsibilityRequestRecord={requestRef:ref('abh.responsibility-request'),resourceOrganizationId:org,
    kind:'Authorization',subjectRef:ref('abh.action'),proposalDigest:`sha256:${'a'.repeat(64)}`,
    evidenceRefs:[ref('abh.artifact')],requiredSlots:[{slotId:'approve',responsibilityType:'Authorization',
      responsibleOrganizationId:org,selectionMode:'ANY',required:true,dependsOnSlotIds:[],
      seats:[{seatId:'any',responsibilityRefs:[assignment.responsibilityRef]}]}],routeRevision:1,decisionRefs:[],
    expiresAt:new Date(Date.now()+60_000).toISOString(),status:'Unresolved'};
  const unsigned:DecisionPackage={requestRef:request.requestRef,routeRevision:1,slotId:'approve',
    subjectRef:request.subjectRef,proposalDigest:request.proposalDigest,question:'Publish fixture?',
    recommendation:'Review the fixture.',alternatives:['Reject'],impactUpperBound:{scopeRefs:[scope],
      resourceRequirements:[],maxMoney:[],description:'Internal fixture only'},risks:[],
    evidenceRefs:request.evidenceRefs,validUntil:request.expiresAt,allowedResponses:['Approved','Rejected'],
    packageDigest:`sha256:${'0'.repeat(64)}`};
  const pkg={...unsigned,packageDigest:await digestContract('DecisionPackage',unsigned)};
  const owner=new DecisionOwner(),openCommand=await command('abh.responsibility-requests.open',{request,packages:[pkg]});
  let opened!:ResponsibilityRequestRecord;
  await db.transaction(review,options(),tx=>executeCommand(tx,openCommand,async()=>{},
    async()=>{opened=await owner.open(tx,openCommand,{request,packages:[pkg]},{lock:async()=>{},
      candidate:async()=>true,submit:async()=>[ref('abh.grant')],revalidate:async()=>{},
      conditions:async()=>[]});
      return opened.requestRef;}));
  const decisionId=opened.decisionRefs[0]!.id,projectionOwner=new ResponsibilityInboxProjectionOwner();

  await assert.rejects(db.transaction(service,options(),tx=>projectionOwner.refresh(tx,decisionId,[])),
    {code:'AUTHORITY_REQUIRED'});
  const reviewReadGrant:GrantRecord={...readGrant,actionTypes:['abh.decisions.read','abh.projections.read']};
  await assert.rejects(db.transaction(review,options(),tx=>projectionOwner.refresh(tx,decisionId,[reviewReadGrant.grantRef])),
    {code:'PURPOSE_DENIED'});
  const runWorker=()=>new Promise<{scanned:number;handled:number;repaired:number}>(async(resolve,reject)=>{
    const controller=new AbortController();
    try{await runResponsibilityInboxProjectionWorker(db,{context:()=>Promise.resolve(service),
      grantRefs:[runtimeGrant.grantRef],signal:controller.signal,intervalMs:60_000,
      onPage:async result=>{controller.abort();resolve(result);}});}
    catch(error){reject(error);}
  });
  const runHostedWorker=()=>new Promise<{scanned:number;handled:number;repaired:number}>(async(resolve,reject)=>{
    const controller=new AbortController();
    try{
      const baseline={recovery:{},publisher:{},consumption:{}} as Omit<TenantRuntimeOptions,'signal'>;
      const loops=createTenantRuntimeLoops(db,{...baseline,
        responsibilityInboxProjection:{context:()=>Promise.resolve(service),
          grantRefs:[runtimeGrant.grantRef],intervalMs:60_000,
          onPage:async result=>{controller.abort();resolve(result);}}});
      assert.equal(loops.length,createTenantRuntimeLoops(db,baseline).length+1);
      await loops.at(-1)!(controller.signal);
    }catch(error){reject(error);}
  });
  const first=await runHostedWorker();
  assert.equal(first.scanned,3);assert.equal(first.handled,3);assert.equal(first.repaired,0);
  const initial=await db.transaction(review,options(),tx=>projectionOwner.get(tx,decisionId));
  assert.equal(initial.projectionType,'abh.projection.responsibility-inbox');
  const initialData=contract('ResponsibilityInboxProjection',initial.data);
  assert.equal(initialData.availableResponses.length,2);assert.equal(initial.watermark,1);
  assert.ok('question' in initial.data===false);

  const decision=await db.transaction(review,options(),tx=>owner.getDecision(tx,decisionId));
  const submission:SubmitDecisionPayload={response:'Approved',packageDigest:decision.package.packageDigest,conditionRefs:[]};
  const submitCommand=await command('abh.decisions.submit',{decisionRef:decision.decisionRef,submission});
  await db.transaction(review,options(),tx=>executeCommand(tx,submitCommand,async()=>{},
    async()=>{const result=await owner.submit(tx,submitCommand,decision.decisionRef,submission,{lock:async()=>{},
      candidate:async()=>true,submit:async()=>[ref('abh.grant')],revalidate:async()=>{},
      conditions:async()=>[]});
      return result.decision.decisionRef;}));
  const second=await runWorker();
  assert.equal(second.scanned,2);assert.equal(second.handled,2);
  const approved=await db.transaction(review,options(),tx=>projectionOwner.get(tx,decisionId));
  assert.deepEqual(approved.data.availableResponses,[]);assert.equal(approved.subjectRef.version,2);
  assert.notEqual(approved.data,initial.data);
  const beforeReplay=await f.admin`SELECT version FROM read.projections WHERE subject_id=${decisionId}`;
  const replay=await runWorker();
  assert.deepEqual(replay,{scanned:0,handled:0,repaired:0});
  const afterReplay=await f.admin`SELECT version FROM read.projections WHERE subject_id=${decisionId}`;
  assert.deepEqual(afterReplay,beforeReplay);

  await f.admin`DELETE FROM read.projections WHERE projection_type='abh.projection.responsibility-inbox'`;
  const rebuilt=await db.transaction(service,options(),tx=>projectionOwner.refresh(tx,decisionId,[runtimeGrant.grantRef]));
  assert.equal(rebuilt.subjectRef.version,2);

  const firstEventRows=await f.admin`SELECT id FROM data.outbox WHERE aggregate_type='abh.decision' AND aggregate_id=${decisionId}
    ORDER BY aggregate_version LIMIT 1`;
  const firstEventId=String(firstEventRows[0]!.id);
  const hints=[];const events=subscribeResponsibilityInboxChanges(db,review,options(),decisionId,
    [reviewReadGrant.grantRef],await firstEventId,50);
  for await(const hint of events){hints.push(hint);break;}
  assert.equal(hints.length,1);assert.equal(hints[0]!.kind,'change');
  if(hints[0]!.kind!=='change')return;
  assert.equal(hints[0]!.projectionType,'abh.projection.responsibility-inbox');
  assert.equal(hints[0]!.subjectRef.id,decisionId);
  assert.deepEqual(Object.keys(hints[0]!).sort(),['cursor','eventId','kind','projectionType','stale',
    'subjectRef','version','watermark']);
});
