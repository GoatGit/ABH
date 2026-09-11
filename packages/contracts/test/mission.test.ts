import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateContract} from '../src/schema.ts';
import {digestContract} from '../src/digest.ts';
import {stateRegistry} from '../src/states.ts';
const ref=(type:string)=>({type,id:'11111111-1111-4111-8111-111111111111',version:1}),digest='sha256:'+'a'.repeat(64);
test('Mission goal revision stays separate from aggregate progress and Draft has no execution facts',()=>{
 const record={missionRef:ref('abh.mission'),resourceOrganizationId:ref('abh.organization').id,goalArtifactRef:ref('abh.artifact'),goalDigest:digest,goalRevision:1,domainType:'hello.mission',workflowRef:{kind:'Workflow',id:'hello.workflow',version:'1.0.0',digest},conditionRef:ref('abh.mission-conditions'),responsibilityScopeRefs:[ref('abh.organization')],status:'Draft',stopEpoch:0,pauseRequested:false,cleanupStatus:'NotRequired',purposeNames:['abh.mission.manage'],createdBy:{type:'Human',id:ref('abh.principal').id},createdAt:'2026-09-09T00:00:00Z',updatedAt:'2026-09-09T00:00:00Z'};
 assert.equal(validateContract('MissionRecord',record).success,true);
 for(const patch of [{goalRevision:2},{activeRunRef:ref('abh.run')},{authorityRef:ref('abh.mission-authority')},{pauseRequested:true},{cleanupStatus:'Pending'},{workflowRef:{...record.workflowRef,kind:'Tool'}}])assert.equal(validateContract('MissionRecord',{...record,...patch}).success,false);
 assert.equal(validateContract('MissionRecord',{...record,missionRef:{...record.missionRef,version:2},status:'Active',authorityRef:ref('abh.mission-authority')}).success,true);
 assert.deepEqual(stateRegistry.machines.Mission.terminal,['Completed','Cancelled']);
});
test('Mission conditions digest binds registered predicates and the immutable goal revision',async()=>{
 const value={conditionRef:ref('abh.mission-conditions'),resourceOrganizationId:ref('abh.organization').id,missionRef:ref('abh.mission'),goalRevision:1,successConditionRef:ref('hello.success'),stopConditionRef:ref('hello.stop'),triggerPolicyRef:ref('hello.trigger'),resourceEnvelopeRef:ref('abh.resource-envelope'),digest};
 assert.equal(validateContract('MissionConditionRecord',value).success,true);
 assert.notEqual(await digestContract('MissionConditionRecord',value),await digestContract('MissionConditionRecord',{...value,successConditionRef:{...value.successConditionRef,version:2}}));
 assert.equal(validateContract('MissionConditionRecord',{...value,script:'return true'}).success,false);
});
