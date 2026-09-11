import {InlineArtifactOwner} from '../src/data/artifacts.ts';
import {checkPackInspectionFailure} from './pack-inspection-failure-fixture.ts';
import {MigrationInspectionCleanupError} from '../src/extensions/inspect-migration-target.ts';
import {failLostPackInspection} from '../src/extensions/fail-lost-pack-inspection.ts';
import type {InstalledMigrationInspectionRun} from '../src/extensions/run-installed-migration-inspection.ts';
import {checkPackInspectionRuntime} from './pack-inspection-runtime-fixture.ts';
import {checkPackInspectionDiagnostic} from './pack-inspection-diagnostic-fixture.ts';
import {checkPackInspectionLeaseLoss} from './pack-inspection-lease-loss-fixture.ts';
import {checkPackInspectionProgressCancellation} from './pack-inspection-progress-cancellation-fixture.ts';
import {checkPackInspectionDelivery} from './pack-inspection-delivery-fixture.ts';
import {OutboxOwner,type OutboxChecks} from '../src/durable/outbox.ts';
import {assertCurrentGrants} from '../src/control/grants.ts';
import {executeCommand,inputDigest} from '../src/data/journal.ts';
import type {GrantRecord} from '@abh/contracts';
import {createPackInspectionJobRouter} from '../src/extensions/inspection-job-router.ts';
import {readCommittedEvent} from '../src/durable/inbox.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import {runPackInspectionJobWorker} from '../src/extensions/inspection-job-worker.ts';
import {connectMigrationTarget} from '../src/extensions/connect-migration-target.ts';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {EntityRef,InstalledPackRecord,RequestPackInspectionCommand} from '@abh/contracts';
import type {VerifiedContext} from '../src/internal/context.ts';
import type {createDatabaseFixture} from './database-fixture.ts';
import {runPackInspectionJob,type PackInspectionJobExecution} from '../src/extensions/run-pack-inspection-job.ts';
import {requestPackInspection} from '../src/extensions/request-pack-inspection.ts';
import {preparePackInspection,type PackInspectionPreparation} from '../src/extensions/prepare-pack-inspection.ts';
import {expirePackInspection} from '../src/extensions/expire-pack-inspection.ts';
import {PackInspectionJobOwner} from '../src/extensions/inspection-jobs.ts';
const options=()=>({deadline:Date.now()+10000,signal:new AbortController().signal});
export async function checkPackInspectionJobExecution(f:Awaited<ReturnType<typeof createDatabaseFixture>>,c:VerifiedContext,installation:InstalledPackRecord,grant:EntityRef,configuration:()=>PackInspectionPreparation){
 const org=c.tenant.resourceOrganizationId,grants=[grant],checks={fenceRefs:async()=>[],current:async()=>{},references:async()=>{},read:async()=>{}};
 const create=async(environmentDigest:string,maxAttempts=2,maxDurationMs=30000,expiresAfterMs=60000)=>{
  const command:RequestPackInspectionCommand={type:'abh.packs.request-inspection',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),target:{type:'abh.organization',id:org},payload:{packRef:{...installation.packRef,type:'abh.installed-pack',version:1},packageDigest:installation.manifest.integrity.packageDigest,environmentDigest,deploymentVersion:installation.deploymentVersion,expiresAt:new Date(Date.now()+expiresAfterMs).toISOString(),maxAttempts,maxDurationMs}};
  return requestPackInspection(f.database,c,options(),command,grants,checks);
 };
 const config=(jobRef:EntityRef):PackInspectionJobExecution=>({context:async()=>c,signal:new AbortController().signal,jobRef,workerId:randomUUID(),grants,read:async()=>{},start:checks,waiting:checks,completion:checks,diagnostic:{dataClass:'abh.data.internal',region:'local',retentionPolicyRef:installation.packRef},prepare:async(context,job,pack,limits)=>{
  const settings=configuration();settings.environmentDigest=job.environmentDigest;delete settings.recoveryDiscovery;
  return preparePackInspection(f.database,context,limits,pack,settings);
 }});
 const released=async()=>{const [row]=await f.admin`SELECT lease_until<=clock_timestamp() AS expired FROM runtime.work_leases WHERE resource_organization_id=${org} AND target_id=${installation.packRef.id}`;assert.equal(row!.expired,true);};
 const missing=await create('sha256:'+'0'.repeat(64));
 const execution=config(missing),pending=runPackInspectionJob(f.database,execution);
 execution.prepare=async()=>{throw new Error('replaced configuration must not execute');};execution.grants=[];execution.start={fenceRefs:async()=>[],current:async()=>{throw new Error('replaced start');}};
 const waiting=await pending;assert.equal(waiting.status,'Waiting');assert.equal(waiting.budget.attempts,1);assert.equal(waiting.diagnostic?.code,'Missing');await released();
 const exhausted=await runPackInspectionJob(f.database,config(waiting.jobRef));assert.equal(exhausted.status,'Failed');assert.equal(exhausted.diagnostic?.code,'BudgetExhausted');assert.equal(exhausted.budget.attempts,2);assert.ok(exhausted.budget.elapsedMs>=waiting.budget.elapsedMs);await released();
 await assert.rejects(runPackInspectionJob(f.database,config(missing)),{code:'VERSION_CONFLICT'});
 await assert.rejects(runPackInspectionJob(f.database,config(exhausted.jobRef)),{code:'PRECONDITION_FAILED'});
 const ready=await create(configuration().environmentDigest),succeeded=await runPackInspectionJob(f.database,config(ready));
 assert.equal(succeeded.status,'Succeeded');assert.equal(succeeded.observation?.matched,true);assert.equal(succeeded.budget.attempts,1);assert.ok(succeeded.budget.elapsedMs>0);await released();
 await checkPackInspectionDiagnostic(f,c,succeeded.jobRef,grants,'Terminal');
 const timed=await create(configuration().environmentDigest,2,1000),timeout=config(timed);let entered=false,signal:AbortSignal|undefined;
 timeout.prepare=async(_context,_job,_pack,limits)=>{entered=true;signal=limits.signal;return new Promise<never>(()=>{});};
 const started=Date.now();await assert.rejects(runPackInspectionJob(f.database,timeout),{code:'DEPENDENCY_TIMEOUT'});assert.equal(entered,true);assert.equal(signal!.aborted,true);assert.ok(Date.now()-started<5000);await released();
 const running=await f.database.transaction(c,options(),tx=>new PackInspectionJobOwner().read(tx,{...timed,version:2},async()=>{}));assert.equal(running.status,'Running');assert.equal(running.budget.attempts,1);
 // The execution boundary cancels bounded work but does not invent a failure;
 // the existing DB-time cleanup settles its persisted Running record.
 const failed=await expirePackInspection(f.database,c,options(),{type:'abh.pack-inspection-jobs.expire',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),target:{type:'abh.pack-inspection-job',id:timed.id},expectedVersion:2,payload:timeout.diagnostic},grants,checks);
 const closed=await f.database.transaction(c,options(),tx=>new PackInspectionJobOwner().read(tx,failed,async()=>{}));assert.equal(closed.diagnostic?.code,'BudgetExhausted');
 const late=await create(configuration().environmentDigest,2,1000),lateInput=config(late);let disposed=0,resolveClosed!:()=>void;
 const closedTarget=new Promise<void>(resolve=>{resolveClosed=resolve;});
 lateInput.prepare=async(_context,_job,_pack,limits)=>{
  const target=await connectMigrationTarget(configuration().targetUrl,limits);
  await new Promise<void>(resolve=>{if(limits.signal.aborted)resolve();else limits.signal.addEventListener('abort',()=>resolve(),{once:true});});
  return {status:'Ready',target:{connection:target.connection,dispose:async()=>{try{await target.dispose();disposed++;}finally{resolveClosed();}}},run:{inspect:async()=>{throw new Error('late target must not inspect');},retention:lateInput.diagnostic,admit:async()=>{},read:async()=>{}}};
 };
 await assert.rejects(runPackInspectionJob(f.database,lateInput),{code:'DEPENDENCY_TIMEOUT'});await closedTarget;assert.equal(disposed,1);await released();
 await expirePackInspection(f.database,c,options(),{type:'abh.pack-inspection-jobs.expire',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),target:{type:'abh.pack-inspection-job',id:late.id},expectedVersion:2,payload:lateInput.diagnostic},grants,checks);

 // Recovery worker discovers only currently admitted Jobs; recreate the worker
 // between attempts to demonstrate that the database, not its cursor, owns progress.
 const recovered=await create('sha256:'+'0'.repeat(64));
 await checkPackInspectionDiagnostic(f,c,recovered,grants,'AwaitDelivery');
 let forbiddenPreparation=false;
 await assert.rejects(runPackInspectionJobWorker(f.database,{...config(recovered),grants:[],expiry:checks,
  discovery:{fenceRefs:async()=>[],admit:async()=>{},canRead:async()=>true},
  prepare:async()=>{forbiddenPreparation=true;return {status:'Missing'};},
 }),{code:'AUTHORITY_REQUIRED'});
 assert.equal(forbiddenPreparation,false);
 await assert.rejects(runPackInspectionJobWorker(f.database,{...config(recovered),expiry:checks,
  discovery:{fenceRefs:async()=>[],admit:async()=>{throw new Error('discovery revoked');},canRead:async()=>true},
 }),/discovery revoked/);
 const sweep=async(selected:EntityRef,requireDelivery:boolean|undefined=undefined,expected=1)=>{
  const stop=new AbortController();let handled=0;
  await runPackInspectionJobWorker(f.database,{...config(selected),signal:stop.signal,expiry:checks,pageSize:100,intervalMs:1,...(requireDelivery===undefined?{}:{requireDelivery}),
   read:async(_tx,job)=>{job.jobRef.id='invalid-callback-mutation';},
   discovery:{fenceRefs:async()=>[],admit:async()=>{},canRead:async(_tx,job)=>job.jobRef.id===selected.id},
   onPage:async stats=>{handled+=stats.executed+stats.expired;if(handled||expected===0&&stats.scanned<100)stop.abort();},
  });
  assert.equal(handled,expected);await released();
 };
 await sweep(recovered,false);
 const resumed=await f.database.transaction(c,options(),tx=>new PackInspectionJobOwner().readCurrent(tx,recovered,async()=>{}));
 assert.equal(resumed.status,'Waiting');assert.equal(resumed.budget.attempts,1);
 const deliveryContext=deriveVerifiedContext({...c.request,purposeOfUse:'abh.runtime.deliver'});
 const routingInput={ruleRef:{type:'hello.routing-rule',id:randomUUID(),version:1},consumerRef:{type:'hello.consumer',id:randomUUID(),version:1},retryDelayMs:5000};
 const installedConsumer=structuredClone(routingInput.consumerRef),router=createPackInspectionJobRouter(routingInput);
 const runtimeGrant:GrantRecord={grantRef:{type:'abh.grant',id:randomUUID(),version:1},resourceOrganizationId:org,principalRef:{type:'abh.principal',id:c.tenant.actor.id,version:1},scopeRefs:[{type:'abh.organization',id:org,version:1}],actionTypes:['abh.runtime.prepare-outbox','abh.runtime.record-outbox-delivery','abh.runtime.enqueue','abh.runtime.consume-event','abh.pack-inspection-jobs.accept-delivery'],purposeNames:['abh.runtime.deliver'],validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+60000).toISOString(),issuanceEvidenceRef:installation.packRef,status:'Active'};
 await f.database.transaction(c,options(),async tx=>{
  await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${runtimeGrant.grantRef.id},${c.tenant.actor.id},${JSON.stringify(runtimeGrant)}::text::jsonb,${runtimeGrant.validFrom},${runtimeGrant.validUntil},'Active')`;
  await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${runtimeGrant.grantRef.id},1)`;
 });
 const outboxChecks:OutboxChecks={fenceRefs:async()=>[runtimeGrant.grantRef],admit:async(tx,_event,permission,targetRef)=>{
  await assertCurrentGrants(tx,{objectRef:targetRef,scopeRefs:[{type:'abh.organization',id:org,version:1}],action:permission},[runtimeGrant.grantRef]);
 }};

 await sweep(recovered,undefined,0);
 routingInput.consumerRef.id=randomUUID();routingInput.retryDelayMs=0;
 for(const kind of ['abh.pack-inspection-job.requested','abh.pack-inspection-job.wait'] as const){
  const event=await f.database.transaction(deliveryContext,options(),async tx=>{
   const [row]=await tx.owner('DurableExecution')`SELECT id FROM data.outbox WHERE aggregate_id=${recovered.id} AND record->>'type'=${kind}`;
   return readCommittedEvent(tx,{type:'abh.event',id:row!.id,version:1});
  });
  const routed=await f.database.transaction(deliveryContext,options(),tx=>router.route(tx,event));
  assert.equal(routed.length,1);const delivery=routed[0]!;
  assert.deepEqual(delivery.consumerRef,installedConsumer);assert.deepEqual(delivery.job.targetRef,event.aggregateRef);
  assert.equal(delivery.job.commandRef.id,event.causationId);assert.equal(delivery.job.causeRef.id,event.eventId);
  assert.equal(delivery.job.authorityRef,undefined);
  const payload={eventRef:{type:'abh.event' as const,id:event.eventId,version:1 as const},eventDigest:await inputDigest(event)},owner=new OutboxOwner();
  const identity={type:'abh.runtime.prepare-outbox',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(payload)};
  const freeze=(installed=router,admission=outboxChecks)=>f.database.transaction(deliveryContext,options(),async tx=>{
   const result=await executeCommand(tx,identity,async()=>{await owner.admitPreparation(tx,payload,admission);},async()=>(await owner.prepare(tx,identity,payload,installed,admission)).routingRef);
   return owner.getRouting(tx,result.receipt.resultRef);
  });
  const frozen=await freeze();assert.deepEqual(frozen.deliveries[0]!.job.targetRef,event.aggregateRef);
  assert.deepEqual(await freeze({...router,route:async()=>{throw new Error('frozen routing must not rerun');}}),frozen);
  await assert.rejects(freeze(router,{...outboxChecks,admit:async()=>{throw new Error('runtime publication revoked');}}),/runtime publication revoked/);

  assert.equal(Date.parse(delivery.job.deadline)-Date.parse(delivery.job.notBefore),kind==='abh.pack-inspection-job.wait'?55000:60000);
  await assert.rejects(f.database.transaction(deliveryContext,options(),tx=>router.route(tx,{...event,causationId:randomUUID()})),{code:'IDEMPOTENCY_CONFLICT'});
  await assert.rejects(f.database.transaction(c,options(),tx=>router.route(tx,event)),{code:'FORBIDDEN'});
  await checkPackInspectionDelivery(f,c,deliveryContext,runtimeGrant.grantRef,router,outboxChecks,payload.eventRef);
  if(kind==='abh.pack-inspection-job.requested')await sweep(recovered,true,0);
 }

 const eligible=await checkPackInspectionDiagnostic(f,c,recovered,grants,'AttemptExecution');assert.ok(eligible.deliveryRef);
 await sweep(recovered,true);
 const recoveredFinal=await f.database.transaction(c,options(),tx=>new PackInspectionJobOwner().readCurrent(tx,recovered,async()=>{}));
 assert.equal(recoveredFinal.status,'Failed');assert.equal(recoveredFinal.budget.attempts,2);
 await checkPackInspectionDiagnostic(f,c,recovered,grants,'Terminal');
 const workerTimed=await create(configuration().environmentDigest,2,1000),stop=new AbortController();let workerExpired=0;
 await runPackInspectionJobWorker(f.database,{...config(workerTimed),signal:stop.signal,expiry:checks,pageSize:100,intervalMs:1,requireDelivery:false,
  discovery:{fenceRefs:async()=>[],admit:async()=>{},canRead:async(_tx,job)=>job.jobRef.id===workerTimed.id},
  prepare:async()=>new Promise<never>(()=>{}),
  onPage:async stats=>{workerExpired+=stats.expired;if(workerExpired)stop.abort();},
 });
 assert.equal(workerExpired,1);await released();
 const workerClosed=await f.database.transaction(c,options(),tx=>new PackInspectionJobOwner().readCurrent(tx,workerTimed,async()=>{}));
 assert.equal(workerClosed.status,'Failed');assert.equal(workerClosed.diagnostic?.code,'BudgetExhausted');

 await checkPackInspectionProgressCancellation(f,c,installation,configuration().targetUrl,()=>create(configuration().environmentDigest),config);

 await checkPackInspectionFailure(f,c,installation,grant,()=>create(configuration().environmentDigest),config);
 await checkPackInspectionLeaseLoss(f,c,installation,grant,()=>create(configuration().environmentDigest),config);

 const [originalGrant]=await f.admin`SELECT record FROM control.grants WHERE resource_organization_id=${org} AND id=${grant.id}`;
 const expiryGrant:GrantRecord={...originalGrant!.record,grantRef:{type:'abh.grant',id:randomUUID(),version:1},actionTypes:['abh.packs.record-data-impact','abh.pack-inspection-jobs.expire']};
 await f.database.transaction(c,options(),async tx=>{
  await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${expiryGrant.grantRef.id},${c.tenant.actor.id},${JSON.stringify(expiryGrant)}::text::jsonb,${expiryGrant.validFrom},${expiryGrant.validUntil},'Active')`;
  await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${expiryGrant.grantRef.id},1)`;
 });
 const notExpired=await create(configuration().environmentDigest);
 let attemptedWithoutGrant=false;
 await assert.rejects(runPackInspectionJobWorker(f.database,{...config(notExpired),grants:[expiryGrant.grantRef],expiry:checks,requireDelivery:false,pageSize:100,intervalMs:1,
  discovery:{fenceRefs:async()=>[],admit:async()=>{},canRead:async(_tx,job)=>job.jobRef.id===notExpired.id},
  prepare:async()=>{attemptedWithoutGrant=true;throw new Error('cleanup cannot execute');},
 }),{code:'FORBIDDEN'});
 assert.equal(attemptedWithoutGrant,false);
 const unchanged=await f.database.transaction(c,options(),tx=>new PackInspectionJobOwner().read(tx,notExpired,async()=>{}));assert.equal(unchanged.status,'Pending');assert.equal(unchanged.budget.attempts,0);
 const undelivered=await create(configuration().environmentDigest,2,30000,1000);
 await f.admin`SELECT pg_sleep(1.1)`;
 const expiredDiagnostic=await checkPackInspectionDiagnostic(f,c,undelivered,grants,'SettleExpired');
 assert.equal(expiredDiagnostic.deliveryRef,undefined);assert.equal(expiredDiagnostic.elapsedMs,0);
 const expiryStop=new AbortController();let sweptExpired=0;
 await runPackInspectionJobWorker(f.database,{...config(undelivered),grants:[],grantSets:{discovery:[expiryGrant.grantRef],expiry:[expiryGrant.grantRef]},signal:expiryStop.signal,expiry:checks,pageSize:100,intervalMs:1,
  discovery:{fenceRefs:async()=>[],admit:async()=>{},canRead:async(_tx,job)=>job.jobRef.id===undelivered.id},
  prepare:async()=>{throw new Error('undelivered expired Job must not execute');},
  onPage:async stats=>{sweptExpired+=stats.expired;if(sweptExpired)expiryStop.abort();},
 });
 assert.equal(sweptExpired,1);
 const expiredJob=await f.database.transaction(c,options(),tx=>new PackInspectionJobOwner().readCurrent(tx,undelivered,async()=>{}));
 assert.equal(expiredJob.status,'Failed');assert.equal(expiredJob.diagnostic?.code,'Expired');assert.equal(expiredJob.budget.attempts,0);assert.equal(expiredJob.budget.elapsedMs,0);

 const doubleFailure=await create(configuration().environmentDigest),doubleInput=config(doubleFailure);let targetDisposals=0;
 doubleInput.prepare=async(_context,_job,_pack,limits)=>{
  const target=await connectMigrationTarget(configuration().targetUrl,limits);
  return {status:'Ready',target:{connection:target.connection,dispose:async()=>{targetDisposals++;await target.dispose();throw new Error('fixture disposal failure');}},
   run:{lease:{} as NonNullable<InstalledMigrationInspectionRun['lease']>,retention:doubleInput.diagnostic,inspect:async()=>{throw new Error('invalid lease must reject before inspection');},admit:async()=>{},read:async()=>{}}};
 };
 await assert.rejects(runPackInspectionJob(f.database,doubleInput),error=>{
  assert.ok(error instanceof AggregateError);assert.equal(error.errors[0].code,'INVALID_ARGUMENT');assert.ok(error.errors[1] instanceof MigrationInspectionCleanupError);return true;
 });
 assert.equal(targetDisposals,1);await released();
 const failedAttempt=await f.database.transaction(c,options(),tx=>new PackInspectionJobOwner().readCurrent(tx,doubleFailure,async()=>{}));
 assert.equal(failedAttempt.status,'Running');assert.equal(failedAttempt.budget.attempts,1);
 // Settle only from the actual released lease; the exception itself is not a
 // persisted failure receipt or proof that arbitrary remote work stopped.
 await failLostPackInspection(f.database,c,options(),{type:'abh.pack-inspection-jobs.fail-lost-lease',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),target:{type:'abh.pack-inspection-job',id:doubleFailure.id},expectedVersion:failedAttempt.jobRef.version,payload:doubleInput.diagnostic},grants,checks);
 const recordedFailure=await create(configuration().environmentDigest);
 const settledFailure=await runPackInspectionJob(f.database,{...doubleInput,jobRef:recordedFailure,failure:checks});
 assert.equal(settledFailure.status,'Failed');assert.equal(settledFailure.diagnostic!.code,'InspectionFailed');assert.equal(targetDisposals,2);
 const savedFailure=await f.database.transaction(c,options(),tx=>new InlineArtifactOwner().read(tx,settledFailure.diagnostic!.evidenceRefs[0]!,async()=>{}));
 const [,failureEvidence]=JSON.parse(new TextDecoder().decode(savedFailure.bytes));assert.equal(failureEvidence.cleanupUnacknowledged,true);assert.equal(failureEvidence.phase,'Inspection');await released();


 const hosted=await create(configuration().environmentDigest);
 await checkPackInspectionRuntime(f,c,hosted,config(hosted));

}
