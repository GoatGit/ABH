import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {EntityRef,GrantRecord} from '@abh/contracts';
import {PgBossDeliveryAdapter} from '@abh/adapter-pg-boss';
import type {createDatabaseFixture} from './database-fixture.ts';
import {Database} from '../src/data/uow.ts';
import type {VerifiedContext} from '../src/internal/context.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import {assertCurrentGrants} from '../src/control/grants.ts';
import {QueueAdmissionDirectory} from '../src/durable/queue-admission.ts';
import {createTenantRuntimeLoops} from '../src/durable/runtime-host.ts';
import {runRuntimeService} from '../src/durable/runtime-service.ts';
import {installPackInspectionRuntime} from '../src/extensions/install-pack-inspection-runtime.ts';
import type {PackInspectionJobExecution} from '../src/extensions/run-pack-inspection-job.ts';
import {PackInspectionJobOwner} from '../src/extensions/inspection-jobs.ts';
const options=()=>({deadline:Date.now()+10000,signal:new AbortController().signal});
export async function checkPackInspectionRuntime(f:Awaited<ReturnType<typeof createDatabaseFixture>>,management:VerifiedContext,jobRef:EntityRef,execution:PackInspectionJobExecution){
 const org=management.tenant.resourceOrganizationId,runtime=deriveVerifiedContext({...management.request,purposeOfUse:'abh.runtime.deliver'}),reconcile=deriveVerifiedContext({...management.request,purposeOfUse:'abh.operation.reconcile'});
 const ref=<T extends string>(type:T)=>({type,id:randomUUID(),version:1});
 const grant:GrantRecord={grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:{type:'abh.principal',id:management.tenant.actor.id,version:1},scopeRefs:[{type:'abh.organization',id:org,version:1}],actionTypes:['abh.runtime.prepare-outbox','abh.runtime.record-outbox-delivery','abh.runtime.enqueue','abh.runtime.consume-event','abh.pack-inspection-jobs.accept-delivery','abh.runtime.record-outbox-consumption','abh.runtime.drain'],purposeNames:['abh.runtime.deliver'],validFrom:new Date(Date.now()-1000).toISOString(),validUntil:management.tenant.contextExpiresAt,issuanceEvidenceRef:jobRef,status:'Active'};
 await f.database.transaction(management,options(),async tx=>{
  await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${grant.grantRef.id},${management.tenant.actor.id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
  await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${grant.grantRef.id},1)`;
 });
 const db=await Database.connect(f.runtimeUrl,{max:8}),consumerId='abh.pack-inspection-job.advance',directory=new QueueAdmissionDirectory(db,[consumerId]),queueErrors:string[]=[];
 const queue=await PgBossDeliveryAdapter.start({connectionString:f.queueUrl,admission:directory,onError:category=>queueErrors.push(category)});
 const stop=new AbortController(),timer=setTimeout(()=>stop.abort(),30000);let observed=false,drained=false,executions=0,acknowledgements=0;
 // Stop at an idle transport boundary: cancellation of a fetched delivery
 // truthfully leaves native retry work and is covered by separate drain tests.
 let fetched=false,queueCalls=0;
 const finish=()=>{if(observed&&!fetched&&queueCalls===0)stop.abort();};
 const transport:Pick<PgBossDeliveryAdapter,'fetch'|'complete'|'enqueue'>={
  fetch:async(...args)=>{queueCalls++;try{const value=await queue.fetch(...args);fetched=!!value;return value;}finally{queueCalls--;finish();}},
  complete:async(...args)=>{await queue.complete(...args);fetched=false;finish();},
  enqueue:async(...args)=>{queueCalls++;try{return await queue.enqueue(...args);}finally{queueCalls--;finish();}},
 };
 const checks={fenceRefs:async()=>[],current:async()=>{},references:async()=>{},read:async()=>{}};
 try{
  const installed=installPackInspectionRuntime({combinedRuleRef:ref('hello.combined-routing'),routing:{ruleRef:ref('hello.inspection-routing'),consumerRef:ref('hello.inspection-consumer'),retryDelayMs:10},runtimeContext:async()=>runtime,acceptanceGrants:[grant.grantRef],acceptance:{fenceRefs:async()=>[],current:async()=>{}},
   worker:{...execution,expiry:checks,leaseLoss:checks,pageSize:100,intervalMs:10,discovery:{fenceRefs:async()=>[],admit:async()=>{},canRead:async(_tx,job)=>job.jobRef.id===jobRef.id},onPage:async stats=>{executions+=stats.executed;}},
   runtime:{
    recovery:{workerId:randomUUID(),context:async()=>reconcile,grantRefs:[],intervalMs:50},
    publisher:{workerId:randomUUID(),context:async()=>runtime,port:transport,...directory.publisherContexts([grant.grantRef]),intervalMs:10,pageSize:100,
     router:{ruleRef:ref('hello.previous-routing'),eventTypes:[],route:async()=>{throw new Error('unregistered old route');}},
     checks:{fenceRefs:async()=>[grant.grantRef],admit:async(tx,_event,permission,targetRef)=>{await assertCurrentGrants(tx,{objectRef:targetRef,scopeRefs:[{type:'abh.organization',id:org,version:1}],action:permission},[grant.grantRef]);}},
    },
    deliveries:[{queue:transport,queueClass:'background',context:async()=>runtime,consumers:[],intervalMs:10,onHandled:async inbox=>{if(inbox.sourceAggregateRef.id===jobRef.id)acknowledgements++;}}],
    consumption:{context:async()=>runtime,grantRefs:[grant.grantRef],intervalMs:10,pageSize:100,onPage:async()=>{
     const [row]=await f.admin`SELECT j.status,
      EXISTS(SELECT 1 FROM data.outbox e JOIN runtime.outbox_routings r ON r.event_id=e.id AND r.resource_organization_id=e.resource_organization_id JOIN runtime.outbox_consumptions x ON x.routing_id=r.id AND x.resource_organization_id=r.resource_organization_id WHERE e.resource_organization_id=${org} AND e.aggregate_id=${jobRef.id} AND e.record->>'type'='abh.pack-inspection-job.requested') AS covered
      FROM extension.inspection_jobs j WHERE j.resource_organization_id=${org} AND j.id=${jobRef.id}`;
     if(row?.status==='Succeeded'&&row.covered&&executions===1&&acknowledgements===1){observed=true;finish();}
    }},
   },
  });
  const report=await runRuntimeService({signal:stop.signal,loops:createTenantRuntimeLoops(db,installed),database:db,queue,
   ...directory.drainContexts({context:async()=>runtime,consumerId,grantRefs:[grant.grantRef],queueClasses:['background'],timeoutMs:5000}),
   recordDrain:async result=>{drained=true;assert.equal(result.drained,true);assert.deepEqual(result.remainingRefs,[]);},
  });
  assert.equal(observed,true,'full pipeline must complete before the bounded test deadline');assert.equal(drained,true);assert.equal(report.drained,true);assert.deepEqual(queueErrors,[]);
  const job=await f.database.transaction(management,options(),tx=>new PackInspectionJobOwner().readCurrent(tx,jobRef,async()=>{}));
  assert.equal(job.status,'Succeeded');assert.equal(job.budget.attempts,1);assert.equal(job.observation?.matched,true);
  const [lease]=await f.admin`SELECT lease_until<=clock_timestamp() AS released FROM runtime.work_leases WHERE resource_organization_id=${org} AND target_id=${job.packRef.id}`;assert.equal(lease!.released,true);
  await assert.rejects(db.transaction(management,options(),async()=>{}));
 }finally{clearTimeout(timer);stop.abort();await queue.close();await db.close();}
}
