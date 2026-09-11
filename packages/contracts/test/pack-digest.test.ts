import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import {canonicalJson,digestPackManifest} from '../src/digest.ts';
const rawHash=(text:string)=>`sha256:${createHash('sha256').update(text,'utf8').digest('hex')}`;
const entry=(ref:string)=>({ref,digest:rawHash('abc'),mediaType:'text/plain',sizeBytes:3});

test('Pack V1 hashes metadata without integrity and signs the exact canonical tagged pair',async()=>{
  const manifest={apiVersion:'abh.open/v1',metadata:{id:'org.example.hello',version:'1.0.0'},artifacts:[entry('z.txt')],migrations:[entry('a.sql')],integrity:{signatureRef:'sig/one.json'}};
  const result=await digestPackManifest(manifest);
  // Fixed raw strings are independent of the implementation's object construction and sorting.
  const bytesDigest='ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
  const expectedManifest=`{"apiVersion":"abh.open/v1","artifacts":[{"digest":"sha256:${bytesDigest}","mediaType":"text/plain","ref":"z.txt","sizeBytes":3}],"metadata":{"id":"org.example.hello","version":"1.0.0"},"migrations":[{"digest":"sha256:${bytesDigest}","mediaType":"text/plain","ref":"a.sql","sizeBytes":3}]}`;
  const expectedSet=`[{"digest":"sha256:${bytesDigest}","kind":"migration","mediaType":"text/plain","ref":"a.sql","sizeBytes":3},{"digest":"sha256:${bytesDigest}","kind":"artifact","mediaType":"text/plain","ref":"z.txt","sizeBytes":3}]`;
  assert.equal(result.manifestDigest,rawHash(expectedManifest));assert.equal(result.artifactSetDigest,rawHash(expectedSet));
  const payload=`["abh-pack-v1","${rawHash(expectedManifest).slice(7)}","${rawHash(expectedSet).slice(7)}"]`;
  assert.equal(result.signaturePayload,payload);assert.equal(result.packageDigest,rawHash(payload));
  assert.deepEqual(await digestPackManifest({...manifest,integrity:{...result,signatureRef:'other.sig',conformanceRef:'ctk.json'}}),result);
  const changed=await digestPackManifest({...manifest,artifacts:[],migrations:[entry('a.sql'),entry('z.txt')]});
  assert.notEqual(changed.artifactSetDigest,result.artifactSetDigest);
});

test('Pack digest rejects path aliases, missing metadata and executable JSON without invoking getters',async()=>{
  for(const path of ['../x','/x','a//b','a/./b','a\\b','a/../b','a.','e\u0301.txt'])await assert.rejects(digestPackManifest({artifacts:[entry(path)],migrations:[]}));
  for(const value of [{artifacts:[entry('A.txt'),entry('a.txt')],migrations:[]},{artifacts:[entry('a')],migrations:[entry('a')]},{artifacts:[]},{artifacts:[{...entry('a'),sizeBytes:-1}],migrations:[]}])await assert.rejects(digestPackManifest(value));
  let invoked=0;await assert.rejects(digestPackManifest({get artifacts(){invoked++;return [];},migrations:[]}));assert.equal(invoked,0);
});

test('Pack hashing snapshots input before asynchronous digests and preserves declared array order',async()=>{
  const manifest={artifacts:[entry('z'),entry('a')],migrations:[]};
  const original=JSON.parse(canonicalJson(manifest)),pending=digestPackManifest(manifest);
  manifest.artifacts[0]!.sizeBytes=99;
  assert.deepEqual(await pending,await digestPackManifest(original));
  const reordered=await digestPackManifest({...original,artifacts:[...original.artifacts].reverse()});
  assert.equal(reordered.artifactSetDigest,(await pending).artifactSetDigest);
  assert.notEqual(reordered.manifestDigest,(await pending).manifestDigest);
});


test('Pack artifact set orders non-BMP refs by UTF-8 bytes',async()=>{
  const first=entry('\ue000.txt'),second=entry('😀.txt');
  const result=await digestPackManifest({artifacts:[second,first],migrations:[]});
  assert.equal(result.artifactSetDigest,rawHash(canonicalJson([{kind:'artifact',...first},{kind:'artifact',...second}])));
  await digestPackManifest({artifacts:[entry('é.txt')],migrations:[]});
});


test('published Pack digest vectors are reproducible',async()=>{
  const vectors=JSON.parse(await readFile(new URL('../fixtures/pack-digest-vectors.json',import.meta.url),'utf8'));
  for(const vector of vectors)assert.deepEqual(await digestPackManifest(vector.manifest),vector.expected,vector.name);
});
