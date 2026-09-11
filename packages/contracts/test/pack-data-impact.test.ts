import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateContract} from '../src/schema.ts';
const digest=`sha256:${'a'.repeat(64)}`,other=`sha256:${'b'.repeat(64)}`;
const definition={kind:'Schema',id:'org.example.schema',digest};
const change={kind:'Schema',id:'org.example.schema',change:'Changed',beforeDigest:digest,afterDigest:other};
const report={subjectDigest:digest,baselineDigest:digest,targetDigest:other,status:'Required',changes:[change],migrationRefs:[],reasons:['DefinitionsChanged']};
test('data impact inventory rejects unknown and duplicate semantic identities',()=>{
 assert.equal(validateContract('PackDataInventory',{complete:true,entries:[definition]}).success,true);
 for(const value of [{complete:true,entries:[definition,definition]},{complete:true,entries:[{...definition,extra:true}]},{entries:[]},{complete:true,entries:[{...definition,digest:'bad'}]}])
  assert.equal(validateContract('PackDataInventory',value).success,false);
 assert.equal(validateContract('PackDataInventory',{complete:false,entries:[]}).success,true);
});
test('impact change kind requires the corresponding before and after digests',()=>{
 for(const value of [change,{...definition,change:'Added',afterDigest:digest},{...definition,change:'Removed',beforeDigest:digest}]){
  const {digest:_,...input}=value as typeof value&{digest?:string};assert.equal(validateContract('PackDataChange',input).success,true);
 }
 for(const value of [{...change,afterDigest:digest},{...change,beforeDigest:undefined},{...change,change:'Added'},{...change,change:'Removed'}])
  assert.equal(validateContract('PackDataChange',value).success,false);
});
test('impact cannot label incomplete or changed definitions as not applicable',()=>{
 assert.equal(validateContract('PackDataImpact',report).success,true);
 for(const patch of [{status:'NotApplicable'},{targetDigest:digest},{reasons:[]},{changes:[]},{changes:[change,change]},{migrationRefs:['001.sql']},
  {reasons:['DefinitionsChanged','InventoryIncomplete']},{changes:[{...change,afterDigest:digest}]},{extra:true}])
  assert.equal(validateContract('PackDataImpact',{...report,...patch}).success,false);
 assert.equal(validateContract('PackDataImpact',{...report,status:'Incomplete',reasons:['DefinitionsChanged','InventoryIncomplete']}).success,true);
 assert.equal(validateContract('PackDataImpact',{...report,status:'NotApplicable',targetDigest:digest,changes:[],reasons:[]}).success,true);
 assert.equal(validateContract('PackDataImpact',{...report,changes:[],migrationRefs:['001.sql','001.sql'],reasons:['DeclaredMigrations']}).success,false);
});
