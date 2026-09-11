import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {test} from 'node:test';
import {ActionCursorCodec} from '../src/server/action-cursor.ts';
import {context} from './database-fixture.ts';

const position={createdAt:'2026-09-08T00:00:00.123456Z',id:randomUUID()};
test('Action cursor preserves microseconds and binds identity, route and every filter',()=>{
  const key=randomBytes(32),codec=new ActionCursorCodec(key),c=context().request,filter={type:'hello.publish',lifecycle:'Validated' as const},token=codec.encode(position,c,filter);
  assert.deepEqual(new ActionCursorCodec(key).decode(token,c,filter),position);
  assert.ok(!Buffer.from(token.slice(4),'base64url').includes(Buffer.from(position.id)));
  for(const patch of [{missionId:randomUUID()},{type:'hello.other'},{lifecycle:'Cancelled' as const},{outcome:'Unknown' as const}])assert.throws(()=>codec.decode(token,c,{...filter,...patch}),{code:'INVALID_ARGUMENT'});
  for(const patch of [{resourceOrganizationId:randomUUID()},{actingOrganizationId:randomUUID()},{workspaceId:randomUUID()},{actor:{...c.actor,id:randomUUID()}},{purposeOfUse:'abh.decision.review'},{scopeEpoch:c.scopeEpoch+1},{sessionEpoch:c.sessionEpoch+1}])assert.throws(()=>codec.decode(token,{...c,...patch},filter),{code:'INVALID_ARGUMENT'});
  assert.deepEqual(codec.decode(token,{...c,requestId:randomUUID(),correlationId:randomUUID()},filter),position);
  assert.throws(()=>codec.decode('ic1.'+token.slice(4),c,filter),{code:'INVALID_ARGUMENT'});
});
test('Action cursor rejects malformed, tampered, wrong-key and expired tokens',async()=>{
  const c=context().request,codec=new ActionCursorCodec(randomBytes(32)),token=codec.encode(position,c,{});
  for(const bad of ['',position.id,token+'=',token.slice(0,-8),'ac1.'+'a'.repeat(600)])assert.throws(()=>codec.decode(bad,c,{}),{code:'INVALID_ARGUMENT'});
  const bytes=Buffer.from(token.slice(4),'base64url');bytes[30]=bytes[30]!^1;assert.throws(()=>codec.decode('ac1.'+bytes.toString('base64url'),c,{}),{code:'INVALID_ARGUMENT'});
  assert.throws(()=>new ActionCursorCodec(randomBytes(32)).decode(token,c,{}),{code:'INVALID_ARGUMENT'});
  const short=new ActionCursorCodec(randomBytes(32),1),expired=short.encode(position,c,{});await delay(5);assert.throws(()=>short.decode(expired,c,{}),{code:'INVALID_ARGUMENT'});
});
test('Action cursor validates explicit keys and exact database timestamp representation',()=>{
  const key=randomBytes(32),codec=new ActionCursorCodec(key),c=context().request,token=codec.encode(position,c,{});key.fill(0);assert.deepEqual(codec.decode(token,c,{}),position);
  assert.throws(()=>new ActionCursorCodec(new Uint8Array(31)));assert.throws(()=>new ActionCursorCodec(randomBytes(32),0));
  assert.throws(()=>codec.encode({...position,createdAt:'2026-09-08T00:00:00.123Z'},c,{}),{code:'INVALID_ARGUMENT'});
});
