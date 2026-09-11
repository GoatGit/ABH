import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateContract} from '../src/schema.ts';
const id='11111111-1111-4111-8111-111111111111',digest='sha256:'+'a'.repeat(64),other='sha256:'+'b'.repeat(64);
const ref=(type:string)=>({type,id,version:1});
const record={packRef:ref('abh.installed-pack'),deploymentVersion:1,compilerRef:{kind:'Compiler',id:'org.example.compiler',version:'1.0.0',digest},environmentDigest:digest,baselineSourceRef:ref('abh.artifact'),targetSourceRef:ref('abh.artifact'),baseline:{complete:true,entries:[]},target:{complete:true,entries:[]},impact:{subjectDigest:digest,baselineDigest:digest,targetDigest:digest,status:'NotApplicable',changes:[],migrationRefs:[],reasons:[]},issuedAt:'2026-09-09T00:00:00Z',expiresAt:'2026-09-09T00:01:00Z'};
test('non-applicability contract requires complete unchanged inventories with no migration',()=>{
 assert.equal(validateContract('PackMigrationNonApplicabilityReport',record).success,true);
 for(const patch of [
  {baseline:{complete:false,entries:[]}},{target:{complete:false,entries:[]}},
  {target:{complete:true,entries:[{kind:'Projection',id:'org.example.projection',digest}]}},
  {impact:{...record.impact,status:'Required',migrationRefs:['001.sql'],reasons:['DeclaredMigrations']}},
  {impact:{...record.impact,status:'Incomplete',reasons:['InventoryIncomplete']}},
  {impact:{...record.impact,changes:[{kind:'Projection',id:'org.example.projection',change:'Added',afterDigest:other}]}},
  {impact:{...record.impact,targetDigest:other}},
  {compilerRef:{...record.compilerRef,kind:'Tool'}},{expiresAt:record.issuedAt},{unknown:true},
 ])assert.equal(validateContract('PackMigrationNonApplicabilityReport',{...record,...patch}).success,false,JSON.stringify(patch));
});

test('non-applicability compares definition sets independently of inventory ordering',()=>{
 const first={kind:'Schema',id:'org.example.schema',digest},second={kind:'Projection',id:'org.example.projection',digest:other};
 assert.equal(validateContract('PackMigrationNonApplicabilityReport',{...record,baseline:{complete:true,entries:[first,second]},target:{complete:true,entries:[second,first]}}).success,true);
});
