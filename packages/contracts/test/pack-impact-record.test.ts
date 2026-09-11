import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateContract} from '../src/schema.ts';
import {digestCommandIntent} from '../src/digest.ts';
import type {RecordPackDataImpactCommand} from '../src/index.ts';
const id='11111111-1111-4111-8111-111111111111',digest=`sha256:${'a'.repeat(64)}` as const;
test('impact record binds compiler, source identities, deployment version and complete inventories',async()=>{
 const command:RecordPackDataImpactCommand={commandId:id,type:'abh.packs.record-data-impact',schemaVersion:'0.1.0',idempotencyKey:'impact-record',target:{type:'abh.organization',id},payload:{report:{
  packRef:{type:'abh.installed-pack',id,version:1},deploymentVersion:1,issuedAt:'2026-09-08T00:00:00Z',expiresAt:'2026-09-08T01:00:00Z',compilerRef:{kind:'Compiler',id:'org.example.compiler',version:'1.0.0',digest},environmentDigest:digest,
  baselineSourceRef:{type:'abh.artifact',id,version:1},targetSourceRef:{type:'abh.artifact',id,version:2},baseline:{complete:true,entries:[]},target:{complete:true,entries:[]},
  impact:{subjectDigest:digest,baselineDigest:digest,targetDigest:digest,status:'NotApplicable',changes:[],migrationRefs:[],reasons:[]}}}};
 assert.equal(validateContract('RecordPackDataImpactCommand',command).success,true);
 const report=command.payload.report;
 for(const patch of [{expiresAt:report.issuedAt},{issuedAt:undefined},{compilerRef:{...report.compilerRef,kind:'Tool'}},{baseline:{complete:false,entries:[]}},{environmentDigest:'invalid'},{deploymentVersion:0},{extra:true}])
  assert.equal(validateContract('RecordPackDataImpactCommand',{...command,payload:{report:{...report,...patch}}}).success,false);
 const original=await digestCommandIntent(command);
 for(const patch of [{expiresAt:'2026-09-08T02:00:00Z'},{deploymentVersion:2},{environmentDigest:`sha256:${'b'.repeat(64)}` as const},{compilerRef:{...report.compilerRef,version:'2.0.0'}},{targetSourceRef:{...report.targetSourceRef,version:3}}])
  assert.notEqual(await digestCommandIntent({...command,payload:{report:{...report,...patch}}}),original);
});
