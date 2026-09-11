import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import type {DispatchPermitRecord,NormalizedOperationObservation} from '@abh/contracts';
import {compareOneShotObservations,type OneShotComparisonRule} from '../src/execution/reconciliation-comparison.ts';
import {FakeProvider} from './support/fake-provider.ts';

const ref=<T extends string>(type:T)=>({type,id:randomUUID(),version:1});
const digest='sha256:'+'a'.repeat(64),connector={kind:'Connector' as const,id:'hello.fake',version:'0.1.0',digest};
const rule:OneShotComparisonRule={ruleRef:ref('hello.completion-policy'),compareSourceVersions:(a,b)=>/^\d+$/.test(a)&&/^\d+$/.test(b)?BigInt(a)<BigInt(b)?-1:BigInt(a)>BigInt(b)?1:0:undefined,
  verifyNoEffect:async observation=>observation.source.kind==='Query'&&observation.source.coverage==='Complete'&&observation.source.visibleThrough==='2026-09-07T01:00:00Z'&&observation.source.noEffectEvidenceRef?.type==='hello.verified-absence'};
const observe=(matches:NormalizedOperationObservation['matches']):NormalizedOperationObservation=>({resourceOrganizationId:randomUUID(),operationId:randomUUID(),connectionRef:ref('abh.connection'),accountRef:ref('hello.account'),connectorRef:connector,
  providerIdempotencyKey:'fixture-provider-key',sourceKey:'query-1',sourceVersion:'1',source:{kind:'Query',queryAuthorityRef:ref('abh.execution-authority'),coverage:'Partial',visibleThrough:'2026-09-07T00:00:00Z'},observedAt:'2026-09-07T00:00:00Z',matches});
const match=(effect:'Applied'|'Pending'|'NoEffect'='Applied',version='1')=>({externalId:'remote-1',sourceVersion:version,payloadDigest:digest,effect});
const permit={providerIdempotencyKey:'fixture-provider-key'} as DispatchPermitRecord;

test('real Fake acceptance with lost response can be confirmed by later visible query evidence',async()=>{
  const fake=new FakeProvider(connector);fake.mode='ResponseLost';
  await assert.rejects(fake.send({permit,payload:new Uint8Array([1]),signal:new AbortController().signal}));
  assert.equal(fake.calls,1);assert.equal(fake.records.length,1);
  const matches=fake.query(permit.providerIdempotencyKey).map(row=>({externalId:row.externalId,sourceVersion:String(row.version),payloadDigest:digest,effect:'Applied' as const}));
  assert.equal((await compareOneShotObservations([observe(matches)],digest,rule)).verdict,'ConfirmedSuccess');
});
test('zero matches during eventual consistency remain Pending until actual provider visibility catches up',async()=>{
  const fake=new FakeProvider(connector);fake.mode='DelayVisibility';await fake.send({permit,payload:new Uint8Array([1]),signal:new AbortController().signal});
  const invisible=observe([]);assert.equal(fake.query(permit.providerIdempotencyKey).length,0);
  assert.equal((await compareOneShotObservations([invisible],digest,rule)).verdict,'Pending');
  fake.now=5000;const found=observe(fake.query(permit.providerIdempotencyKey).map(row=>({...match(),externalId:row.externalId})));
  assert.equal((await compareOneShotObservations([invisible,found],digest,rule)).verdict,'ConfirmedSuccess');assert.equal(fake.calls,1);
});
test('multiple real provider identities produce Ambiguous and cannot be repaired by picking one receipt',async()=>{
  const fake=new FakeProvider(connector);fake.mode='Duplicate';await fake.send({permit,payload:new Uint8Array([1]),signal:new AbortController().signal});
  const found=observe(fake.query(permit.providerIdempotencyKey).map(row=>({...match(),externalId:row.externalId})));
  assert.equal(found.matches.length,2);assert.equal((await compareOneShotObservations([observe([found.matches[0]!]),found],digest,rule)).verdict,'Ambiguous');
});
test('native key remains stable through direct provider replay while comparison sees one remote record',async()=>{
  const fake=new FakeProvider(connector);await fake.send({permit,payload:new Uint8Array([1]),signal:new AbortController().signal});await fake.send({permit,payload:new Uint8Array([1]),signal:new AbortController().signal});
  assert.equal(fake.calls,2);assert.equal(fake.records.length,1);
});
test('no-effect requires registered complete visibility proof; elapsed time or failure label is insufficient',async()=>{
  assert.equal((await compareOneShotObservations([observe([match('NoEffect')])],digest,rule)).verdict,'Pending');
  const noEffect=observe([]);noEffect.source={kind:'Query',queryAuthorityRef:ref('abh.execution-authority'),coverage:'Complete',visibleThrough:'2026-09-07T01:00:00Z'};
  assert.equal((await compareOneShotObservations([noEffect],digest,rule)).verdict,'Pending');
  noEffect.source.noEffectEvidenceRef=ref('hello.verified-absence');assert.equal((await compareOneShotObservations([noEffect],digest,rule)).verdict,'ConfirmedNoEffect');
  noEffect.source.coverage='Partial';assert.equal((await compareOneShotObservations([noEffect],digest,rule)).verdict,'Pending');
});
test('same-version conflicts, incomparable versions, changed payload and historical success cannot be erased',async()=>{
  for(const observations of [[observe([match()]),observe([match('NoEffect')])],[observe([match()]),observe([match('Applied','opaque')])],
    [observe([{...match(),payloadDigest:'sha256:'+'b'.repeat(64)}])],[observe([match()]),observe([match('NoEffect','2')])],
    [observe([match()]),observe([{...match(),externalId:'remote-2'}])],[observe([match('Applied','10')]),observe([match('Pending','1')]),observe([match('Applied','1')])]]){
    assert.equal((await compareOneShotObservations(observations,digest,rule)).verdict,'Conflicting');
  }
  const selected=await compareOneShotObservations([observe([match('Pending','1')]),observe([match('Applied','10')]),observe([match('Pending','2')])],digest,rule);
  assert.equal(selected.verdict,'ConfirmedSuccess');assert.deepEqual(selected.confirmedExternal,{externalId:'remote-1',sourceVersion:'10'});
  await assert.rejects(compareOneShotObservations([],digest,rule),{code:'OPERATION_FACT_CONFLICT'});
});
