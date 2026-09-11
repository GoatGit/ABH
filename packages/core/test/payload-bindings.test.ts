import assert from 'node:assert/strict';
import {test} from 'node:test';
import {bindJsonFields} from '../src/execution/payload-bindings.ts';

test('declared parent outputs replace only exact JSON pointer fields and leave the template unchanged',()=>{
  const template={'a/b':{'~key':[null]},message:'keep',externalId:null};
  const result=bindJsonFields(template,[{path:'/a~1b/~0key/0',value:'version-2'},{path:'/externalId',value:'remote-1'}]);
  assert.deepEqual(result,{'a/b':{'~key':['version-2']},message:'keep',externalId:'remote-1'});
  assert.equal(template.externalId,null);assert.deepEqual(template['a/b']['~key'],[null]);
});
test('prototype keys, overlapping paths, invalid escapes and array growth cannot enter resolved payloads',()=>{
  for(const path of ['/__proto__/polluted','/constructor/prototype','/prototype','/rows/-','/rows/01','/rows/1','/rows/length','/x~2','externalId','']){
    assert.throws(()=>bindJsonFields({rows:[null]},[{path,value:'unsafe'}]),{code:'ACTION_PLAN_SCOPE_EXCEEDED'});
  }
  for(const paths of [['/a','/a/b'],['/a/b','/a'],['/a','/a']])assert.throws(()=>bindJsonFields({a:{}},paths.map(path=>({path,value:'x'}))),{code:'ACTION_PLAN_SCOPE_EXCEEDED'});
  assert.equal(Object.hasOwn(Object.prototype,'polluted'),false);
});
test('bindings cannot traverse missing or scalar intermediate fields',()=>{
  for(const template of [null,1,{a:1},{}])assert.throws(()=>bindJsonFields(template,[{path:'/a/b',value:'remote'}]),{code:'ACTION_PLAN_SCOPE_EXCEEDED'});
  assert.deepEqual(bindJsonFields({},[{path:'/externalId',value:'remote'}]),{externalId:'remote'});
});
