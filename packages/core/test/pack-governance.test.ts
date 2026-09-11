import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateCurrentPack} from '../src/extensions/validate-current-pack.ts';
import {packManifest} from './pack-fixture.ts';
test('current Pack governance read has a bounded cancellation signal before filesystem access',async()=>{
 let aborted=false;
 await assert.rejects(validateCurrentPack({root:'/nonexistent/pack',manifest:await packManifest(),limits:{maxFileBytes:1024,maxTotalBytes:4096,maxEntries:20}},
  {async current(_id,options){options.signal.addEventListener('abort',()=>{aborted=true;});return new Promise(()=>{});}},
  {deadline:Date.now()+100,signal:new AbortController().signal}),{code:'DEPENDENCY_TIMEOUT'});
 assert.equal(aborted,true);
});
