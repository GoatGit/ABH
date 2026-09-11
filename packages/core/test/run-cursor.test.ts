import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomBytes,randomUUID} from 'node:crypto';
import {RunCursorCodec} from '../src/server/run-cursor.ts';
import {context} from './database-fixture.ts';

const position={updatedAt:'2026-09-11T10:00:00.123456Z',id:randomUUID()};
const filter={missionStatus:'Completed' as const,missionId:randomUUID()};

test('Run cursor binds identity and filters, rejects drift, tampering, expiry and bad keys',async()=>{
 const key=randomBytes(32),codec=new RunCursorCodec(key),request=context().request;
 const token=codec.encode(position,request,filter);
 assert.deepEqual(codec.decode(token,request,filter),position);
 const foreign=context(randomUUID()).request;
 assert.throws(()=>codec.decode(token,foreign,filter),{code:'INVALID_ARGUMENT'});
 assert.throws(()=>codec.decode(token,request,{...filter,missionId:randomUUID()}),{code:'INVALID_ARGUMENT'});
 const tampered=token.slice(0,-2)+(token.endsWith('aa')?'bb':'aa');
 assert.throws(()=>codec.decode(tampered,request,filter),{code:'INVALID_ARGUMENT'});
 const short=new RunCursorCodec(randomBytes(32),1),expired=short.encode(position,request,filter);
 await new Promise(resolve=>setTimeout(resolve,5));
 assert.throws(()=>short.decode(expired,request,filter),{code:'INVALID_ARGUMENT'});
 assert.throws(()=>new RunCursorCodec(new Uint8Array(31)));
 assert.throws(()=>new RunCursorCodec(randomBytes(32),0));
});
