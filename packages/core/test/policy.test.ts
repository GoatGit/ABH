import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {digestBytes} from '@abh/contracts/digest';
import {WasmPolicy,intersectPolicies} from '../src/control/policy.ts';

test('actual OPA-WASM executes bounded closed policy results',{timeout:15_000},async t=>{
  const bytes=new Uint8Array(await readFile(new URL('./fixtures/policy.wasm',import.meta.url))),digest=await digestBytes(bytes);
  const provenance=JSON.parse(await readFile(new URL('./fixtures/policy-provenance.json',import.meta.url),'utf8'));
  assert.equal(digest,provenance.wasmDigest);assert.equal(await digestBytes(await readFile(new URL('./fixtures/policy.rego',import.meta.url))),provenance.sourceDigest);
  const signal=()=>new AbortController().signal;
  const load=async(name:string)=>{const policy=await WasmPolicy.load(bytes,digest,`abh_fixture/${name}`);t.after(()=>policy.close());return policy;};
  const policy=await load('decision'),input={active:true,purpose:'abh.action.execute',amount:3,ceiling:10};
  await t.test('current inputs change the real Rego answer; Mandatory deny dominates empty Behavior',async()=>{
    const empty=await load('empty_behavior'),behavior=await empty.evaluate({},signal());
    assert.equal((await policy.evaluate(input,signal())).allow,true);
    for(const denied of [{...input,active:false},{...input,purpose:'hello.other'},{...input,amount:11},{}]){
      const mandatory=await policy.evaluate(denied,signal());assert.equal(mandatory.allow,false);
      assert.equal(intersectPolicies([{kind:'Mandatory',decision:mandatory},{kind:'Behavior',decision:behavior}]).allow,false);
    }
    assert.equal((await policy.evaluate(input,signal())).allow,true,'previous input is not retained');
  });
  await t.test('digest drift, unknown entrypoint, malformed and undefined decisions fail closed',async()=>{
    await assert.rejects(WasmPolicy.load(bytes,'sha256:'+'0'.repeat(64),'abh_fixture/decision'),{code:'POLICY_DENIED'});
    await assert.rejects(WasmPolicy.load(bytes,digest,'abh_fixture/missing'),{code:'POLICY_DENIED'});
    for(const name of ['malformed','undefined_decision','host_time']){const invalid=await load(name);await assert.rejects(invalid.evaluate(input,signal()),{code:'POLICY_DENIED'});}
  });
  await t.test('input byte limit and JSON preflight reject before policy evaluation',async()=>{
    await assert.rejects(policy.evaluate({large:'x'.repeat(65_536)},signal()),{code:'LIMIT_EXCEEDED'});
    let getterCalled=false;await assert.rejects(policy.evaluate({get active(){getterCalled=true;return true;}},signal()),{code:'INVALID_ARGUMENT'});assert.equal(getterCalled,false);
  });
  await t.test('hard timeout terminates an actual expensive Rego evaluation and prevents reuse',async()=>{
    const slow=await WasmPolicy.load(bytes,digest,'abh_fixture/slow',{timeLimitMs:1});t.after(()=>slow.close());const start=Date.now();
    await assert.rejects(slow.evaluate({work:5000},signal()),{code:'DEPENDENCY_TIMEOUT'});assert.ok(Date.now()-start<2000);
    await assert.rejects(slow.evaluate({work:0},signal()),{code:'POLICY_DENIED'});
  });
  await t.test('cancellation prevents evaluation and closes the runtime',async()=>{
    const cancelled=await load('decision'),controller=new AbortController();controller.abort();
    await assert.rejects(cancelled.evaluate(input,controller.signal),{code:'DEPENDENCY_TIMEOUT'});
    await assert.rejects(cancelled.evaluate(input,signal()),{code:'POLICY_DENIED'});
  });
  await t.test('missing policy family and contradictory obligation versions cannot authorize',()=>{
    const decision={allow:true,obligationRefs:[],reasonCodes:[]};assert.throws(()=>intersectPolicies([{kind:'Behavior',decision}]),{code:'POLICY_DENIED'});
    const obligation={type:'abh.obligation',id:randomUUID(),version:1};
    assert.throws(()=>intersectPolicies([{kind:'Mandatory',decision:{...decision,obligationRefs:[obligation]}},{kind:'Behavior',decision:{...decision,obligationRefs:[{...obligation,version:2}]}}]),{code:'OBLIGATION_CONFLICT'});
  });
});
