import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {test} from 'node:test';
import {InboxCursorCodec} from '../src/server/inbox-cursor.ts';
import {context} from './database-fixture.ts';

test('cursor hides the position, survives host recreation and binds identity and filters',()=>{
  const key=randomBytes(32),codec=new InboxCursorCodec(key),c=context().request,id=randomUUID(),filter={status:'Pending',kind:'Authorization'};
  const token=codec.encode(id,c,filter);assert.ok(!token.includes(id));assert.ok(!Buffer.from(token.slice(4),'base64url').includes(Buffer.from(id)));
  assert.equal(new InboxCursorCodec(key).decode(token,c,filter),id);
  assert.notEqual(codec.encode(id,c,filter),token);
  for(const patch of [{resourceOrganizationId:randomUUID()},{actingOrganizationId:randomUUID()},{workspaceId:randomUUID()},{actor:{...c.actor,id:randomUUID()}},{purposeOfUse:'abh.decision.review'},{scopeEpoch:c.scopeEpoch+1},{sessionEpoch:c.sessionEpoch+1}])assert.throws(()=>codec.decode(token,{...c,...patch},filter),{code:'INVALID_ARGUMENT'});
  for(const patch of [{status:'Approved'},{kind:'Exception'},{expiresBefore:new Date().toISOString()}])assert.throws(()=>codec.decode(token,c,{...filter,...patch}),{code:'INVALID_ARGUMENT'});
  assert.equal(codec.decode(token,{...c,requestId:randomUUID(),correlationId:randomUUID()},filter),id);
});

test('tampered, malformed, wrong-key and expired cursors fail without plaintext errors',async()=>{
  const c=context().request,codec=new InboxCursorCodec(randomBytes(32)),token=codec.encode(randomUUID(),c,{});
  for(const value of ['',randomUUID(),token+'=',token.slice(0,-8),`ic1.${'a'.repeat(600)}`,'ic1.!!!!'])assert.throws(()=>codec.decode(value,c,{}),{code:'INVALID_ARGUMENT'});
  const bytes=Buffer.from(token.slice(4),'base64url');bytes[bytes.length-1]=bytes[bytes.length-1]!^1;
  assert.throws(()=>codec.decode('ic1.'+bytes.toString('base64url'),c,{}),{code:'INVALID_ARGUMENT'});
  assert.throws(()=>new InboxCursorCodec(randomBytes(32)).decode(token,c,{}),{code:'INVALID_ARGUMENT'});
  const short=new InboxCursorCodec(randomBytes(32),1),expired=short.encode(randomUUID(),c,{});await delay(5);
  assert.throws(()=>short.decode(expired,c,{}),{code:'INVALID_ARGUMENT'});
});

test('key configuration is explicit and copied',()=>{
  assert.throws(()=>new InboxCursorCodec(new Uint8Array(16)));
  assert.throws(()=>new InboxCursorCodec(new Uint8Array(32),Infinity));
  const key=randomBytes(32),codec=new InboxCursorCodec(key),c=context().request,id=randomUUID(),token=codec.encode(id,c,{});
  key.fill(0);assert.equal(codec.decode(token,c,{}),id);
});
