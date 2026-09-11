import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateContract} from '../src/schema.ts';
import {createContractCatalog} from '../src/catalog.ts';
import {readSources} from '../scripts/generate.mjs';
import {lintCatalog} from '../scripts/foundation.mjs';
import {lintProtocol} from '../scripts/protocol.mjs';
const ref=(type:string)=>({type,id:'11111111-1111-4111-8111-111111111111',version:1});
const pending={jobRef:ref('abh.pack-inspection-job'),status:'Pending',assessedAt:'2026-09-09T00:00:00Z',nextStep:'AwaitDelivery',evidenceRefs:[],elapsedMs:0,remainingDurationMs:30000,remainingAttempts:3};
test('inspection diagnostics distinguish actionable discovery, live work, loss and terminal progress',()=>{
 const valid=(value:unknown)=>validateContract('PackInspectionDiagnostic',value).success;
 for(const value of [pending,{...pending,nextStep:'AttemptExecution',deliveryRef:ref('abh.pack-inspection-delivery')},{...pending,status:'Running',nextStep:'ObserveRunning',leaseRef:ref('abh.work-lease')},{...pending,status:'Running',nextStep:'SettleLostLease',leaseRef:ref('abh.work-lease'),leaseLoss:'Replaced'},{...pending,status:'Failed',nextStep:'Terminal'},{...pending,nextStep:'SettleExpired',remainingDurationMs:0}])assert.equal(valid(value),true);
 for(const value of [{...pending,nextStep:'Terminal'},{...pending,nextStep:'AttemptExecution'},{...pending,status:'Running',nextStep:'ObserveRunning'},{...pending,leaseRef:ref('abh.work-lease')},{...pending,status:'Running',nextStep:'SettleLostLease',leaseRef:ref('abh.work-lease')},{...pending,remainingAttempts:-1},{...pending,rawError:'secret'}])assert.equal(valid(value),false);
});
test('query permissions retain explicit Pack targets and purposes without widening existing authority',async()=>{
 const catalog=createContractCatalog();assert.equal(catalog.success,true);if(!catalog.success)return;
 const action=catalog.data.actions['abh.packs.record-data-impact'];assert.deepEqual(action?.targetTypes,['abh.organization']);assert.deepEqual(action?.purposeNames,['abh.pack.manage']);
 const s=await readSources(),definitions={...s.publicSchema.$defs,...s.workflowSchema.$defs,...s.factsSchema.$defs};
 for(const field of ['targetTypes','purposeNames']){
  const protocol=structuredClone(s.protocol),query=protocol.queries.find((q:{type:string})=>q.type==='abh.pack-inspection-jobs.inspect');query[field]=[];
  assert.throws(()=>lintProtocol(protocol,definitions,s.states,s.errors,s.manifest.version));
  query[field]=['hello.unknown'];assert.throws(()=>lintCatalog(s.catalog,definitions,s.states,protocol,s.manifest.version));
 }
 const protocol=structuredClone(s.protocol);protocol.queries.find((q:{type:string})=>q.type==='abh.pack-inspection-jobs.inspect').targetTypes=['abh.action'];
 assert.throws(()=>lintCatalog(s.catalog,definitions,s.states,protocol,s.manifest.version),/broadens/);
});
