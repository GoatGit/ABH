import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {validateContract} from '../src/schema.ts';
import {validatePortRequest} from '../src/ports.ts';
const ref=(type:string)=>({type,id:randomUUID(),version:1});
test('inspection delivery binds an exact Job and committed cause without execution authority',()=>{
 const job={jobType:'abh.pack-inspection-job.advance',targetRef:ref('abh.pack-inspection-job'),commandRef:ref('abh.command'),dedupeKey:'inspection/advance',causeRef:ref('abh.event'),notBefore:'2026-09-09T00:00:00Z',deadline:'2026-09-09T00:01:00Z'};
 assert.equal(validateContract('JobEnvelope',job).success,true);
 for(const patch of [
  {targetRef:ref('abh.installed-pack')},{targetRef:ref('abh.action')},{jobType:'abh.action.advance'},
  {authorityRef:ref('abh.execution-authority')},{authorityRef:ref('abh.mission-authority')},{causeRef:ref('abh.pack-inspection-job')},
  {causeRef:{...job.causeRef,version:2}},{commandRef:{...job.commandRef,version:2}},{deadline:job.notBefore},
 ])assert.equal(validateContract('JobEnvelope',{...job,...patch}).success,false);
 const request={context:{callId:randomUUID(),requestContextRef:ref('abh.request-context'),target:{objectRef:job.targetRef,scopeRefs:[ref('abh.organization')],action:'abh.runtime.enqueue'},deadline:job.deadline},job};
 assert.equal(validatePortRequest('DurableExecutionPort.enqueue',request).success,true);
 assert.equal(validatePortRequest('DurableExecutionPort.enqueue',{...request,job:{...job,targetRef:{...job.targetRef,version:2}}}).success,false);
 assert.equal(validatePortRequest('DurableExecutionPort.enqueue',{...request,context:{...request.context,target:{...request.context.target,action:'abh.pack-inspection-jobs.start'}}}).success,false);
});
