import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateContract} from '../src/schema.ts';
import {createContractCatalog,validateRegisteredTarget} from '../src/catalog.ts';
import {digestCommandIntent} from '../src/digest.ts';
import {protocolRegistry} from '../src/http.ts';
const id='11111111-1111-4111-8111-111111111111';
const pack={type:'abh.installed-pack',id,version:1};
const command={type:'abh.packs.record-conformance',schemaVersion:'0.1.0',commandId:id,idempotencyKey:'ctk-record-fixture',target:{type:'abh.organization',id},payload:{packRef:pack,retention:{dataClass:'abh.data.internal',region:'local',retentionPolicyRef:{type:'abh.artifact',id,version:1}}}};
test('CTK publication has its own internal command, closed payload and management action',async()=>{
 assert.equal(validateContract('RecordPackConformanceCommand',command).success,true);
 for(const payload of [{...command.payload,report:{}},{...command.payload,root:'/tmp/pack'},{...command.payload,packRef:{...pack,type:'abh.artifact'}},{...command.payload,retention:{...command.payload.retention,extra:true}}])assert.equal(validateContract('RecordPackConformanceCommand',{...command,payload}).success,false);
 assert.equal(protocolRegistry.commands.find(c=>c.type===command.type)!.visibility,'Internal');
 const catalog=createContractCatalog();assert.equal(catalog.success,true);if(!catalog.success)return;
 const scope={type:'abh.organization',id,version:1},target={objectRef:scope,scopeRefs:[scope],action:command.type};
 assert.equal(validateRegisteredTarget(catalog.data,target,'abh.pack.manage').success,true);
 assert.equal(validateRegisteredTarget(catalog.data,target,'abh.action.prepare').success,false);
 assert.equal(validateRegisteredTarget(catalog.data,{...target,action:'abh.artifacts.store-inline'},'abh.pack.manage').success,false);
 const checked=validateContract('RecordPackConformanceCommand',command);if(!checked.success)return;
 const first=await digestCommandIntent(checked.data);
 for(const patch of [{packRef:{...pack,version:2}},{retention:{...command.payload.retention,region:'different'}}]){
  const changed=validateContract('RecordPackConformanceCommand',{...command,payload:{...command.payload,...patch}});assert.equal(changed.success,true);if(changed.success)assert.notEqual(await digestCommandIntent(changed.data),first);
 }
});

test('Pack approval request is an independent internal management action',()=>{
 const entry=protocolRegistry.commands.find(c=>c.type==='abh.packs.request-enable')!;
 assert.equal(entry.visibility,'Internal');assert.equal(entry.owner,'PackLoader');assert.equal(entry.payload,'RequestPackEnablePayload');
 const catalog=createContractCatalog();assert.equal(catalog.success,true);if(!catalog.success)return;
 const scope={type:'abh.organization',id,version:1},target={objectRef:scope,scopeRefs:[scope],action:entry.type};
 assert.equal(validateRegisteredTarget(catalog.data,target,'abh.pack.manage').success,true);
 assert.equal(validateRegisteredTarget(catalog.data,target,'abh.action.prepare').success,false);
 assert.equal(validateContract('RequestPackEnableCommand',{...command,type:entry.type}).success,false);
});
