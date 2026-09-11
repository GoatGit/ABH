import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {ArtifactRecord} from '@abh/contracts';
import {decodeReceiptBytes,encodeRawTransport,rawTransportMediaType} from '../src/execution/raw-transport.ts';

const record={mediaType:rawTransportMediaType} as ArtifactRecord;
test('inline raw evidence preserves every byte, including invalid UTF-8, at the supported bound',async()=>{
  for(const size of [0,256,48_000]){
    const raw=Uint8Array.from({length:size},(_,i)=>i%256),encoded=await encodeRawTransport(raw);
    assert.ok(new TextEncoder().encode(encoded).length<=65_536);
    assert.deepEqual(await decodeReceiptBytes(record,new TextEncoder().encode(encoded)),raw);
  }
  await assert.rejects(encodeRawTransport(new Uint8Array(48_001)),{code:'LIMIT_EXCEEDED'});
});
test('tampered length, digest or noncanonical base64 cannot masquerade as original transport bytes',async()=>{
  const valid=JSON.parse(await encodeRawTransport(new Uint8Array([0,255,254])));
  for(const patch of [{sizeBytes:2},{digest:'sha256:'+'0'.repeat(64)},{bytes:valid.bytes+'\n'},{encoding:'utf8'},{extra:'unexpected'}]){
    await assert.rejects(decodeReceiptBytes(record,new TextEncoder().encode(JSON.stringify({...valid,...patch}))),{code:'RAW_RECEIPT_UNSUPPORTED'});
  }
});
