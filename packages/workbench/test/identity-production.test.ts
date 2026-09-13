import assert from 'node:assert/strict';
import {createHash,createHmac,createPublicKey,generateKeyPairSync,sign,
  type KeyObject} from 'node:crypto';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {test} from 'node:test';
import {createProductionIdentityAdapter} from '../src/lib/identity-production.ts';

const ORG_A='00000000-0000-4000-8000-0000000000a1';
const ORG_B='00000000-0000-4000-8000-0000000000a2';

const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk=publicKey.export({format:'jwk'}) as Record<string,string>;
jwk.kid='test-key';jwk.use='sig';jwk.alg='RS256';

function startJwks():Promise<{url:string;close():Promise<void>}>{
  const server=createServer((request,response)=>{
    response.writeHead(200,{'Content-Type':'application/json'});
    response.end(JSON.stringify({keys:[jwk]}));
  });
  return new Promise(resolve=>{
    server.listen(0,'127.0.0.1',()=>{
      const {port}=server.address() as AddressInfo;
      resolve({url:`http://127.0.0.1:${port}/jwks`,close:()=>new Promise(done=>{server.close(()=>done(undefined));})});
    });
  });
}

const b64url=(input:object|string|Buffer)=>{
  const bytes=typeof input==='string'?Buffer.from(input):Buffer.isBuffer(input)?input:Buffer.from(JSON.stringify(input));
  return bytes.toString('base64url');
};

function rs256Token(claims:object,privateKeyOverride:KeyObject=privateKey,keyId='test-key'):string{
  const header=Buffer.from(JSON.stringify({alg:'RS256',kid:keyId})).toString('base64url');
  const payload=b64url(claims);
  const signature=sign('rsa-sha256',Buffer.from(`${header}.${payload}`),privateKeyOverride);
  return `${header}.${payload}.${signature.toString('base64url')}`;
}

const claimsFor=()=>({
  sub:'00000000-0000-4000-8000-0000000000b1',name:'Operator One',
  iss:'https://idp.example',aud:'abh-workbench',exp:Math.floor(Date.now()/1000)+600,
  abh_purpose:'abh.mission.manage',
  abh_organizations:[
    {key:'a',label:'Org A',actingOrganizationId:ORG_A,resourceOrganizationId:ORG_A},
    {key:'b',label:'Org B',actingOrganizationId:ORG_B,resourceOrganizationId:ORG_B,workspaceId:'00000000-0000-4000-8000-0000000000cc'},
  ],
});

test('without identity configuration the production adapter is not selected',()=>{
  assert.equal(createProductionIdentityAdapter({}),null);
  assert.equal(createProductionIdentityAdapter({ABH_IDENTITY_ISSUER:'x'}),null);
  assert.throws(()=>createProductionIdentityAdapter({
    ABH_IDENTITY_ISSUER:'https://idp.example',ABH_IDENTITY_AUDIENCE:'abh-workbench',
    ABH_IDENTITY_JWKS_URL:'https://127.0.0.1/jwks',ABH_IDENTITY_SHARED_SECRET:'s3cret'}),
    /exactly one/);
});

test('a verified token becomes a session whose api headers relay the same bearer token',async t=>{
  const jwks=await startJwks();t.after(()=>jwks.close());
  const adapter=createProductionIdentityAdapter({
    ABH_IDENTITY_JWKS_URL:jwks.url,ABH_IDENTITY_ISSUER:'https://idp.example',
    ABH_IDENTITY_AUDIENCE:'abh-workbench'})!;
  assert.ok(adapter);
  const token=rs256Token(claimsFor());
  const session=await adapter.resolve(new Headers({authorization:`Bearer ${token}`}));
  assert.ok(session);
  assert.equal(session.actorId,'00000000-0000-4000-8000-0000000000b1');
  assert.equal(session.displayName,'Operator One');
  assert.equal(session.actingOrganizationId,ORG_A);
  assert.equal(session.purposeOfUse,'abh.mission.manage');
  assert.deepEqual(await session.apiHeaders(new AbortController().signal),
    {authorization:`Bearer ${token}`});
  assert.equal(session.switchableOrganizations.length,1);
  assert.equal(session.switchableOrganizations[0]!.key,'b');
  assert.equal(session.switchableOrganizations[0]!.workspaceId,'00000000-0000-4000-8000-0000000000cc');
  const headers=new Headers({authorization:`Bearer ${token}`});
  const selected=await adapter.resolve(headers,
    {actingOrganizationId:ORG_B,resourceOrganizationId:ORG_B,workspaceId:'00000000-0000-4000-8000-0000000000cc'});
  assert.ok(selected);
  assert.equal(selected.actingOrganizationId,ORG_B);
  assert.equal(selected.workspaceId,'00000000-0000-4000-8000-0000000000cc');
  const foreign=await adapter.resolve(headers,
    {actingOrganizationId:'00000000-0000-4000-8000-0000000000ff',
      resourceOrganizationId:'00000000-0000-4000-8000-0000000000ff'});
  assert.ok(foreign);
  assert.equal(foreign.actingOrganizationId,ORG_A,'cookie selection outside token membership is ignored');
});

test('authorization digest is stable per verified identity and independent of the raw token',async t=>{
  const jwks=await startJwks();t.after(()=>jwks.close());
  const adapter=createProductionIdentityAdapter({
    ABH_IDENTITY_JWKS_URL:jwks.url,ABH_IDENTITY_ISSUER:'https://idp.example',
    ABH_IDENTITY_AUDIENCE:'abh-workbench'})!;
  const first=await adapter.resolve(new Headers({authorization:`Bearer ${rs256Token(claimsFor())}`}));
  const second=await adapter.resolve(new Headers({authorization:`Bearer ${rs256Token(claimsFor())}`}));
  assert.ok(first&&second);
  assert.equal(first.authorizationDigest,second.authorizationDigest);
  assert.equal(first.authorizationDigest.length,64);
  const shifted={...claimsFor(),exp:Math.floor(Date.now()/1000)+900};
  const third=await adapter.resolve(new Headers({authorization:`Bearer ${rs256Token(shifted)}`}));
  assert.ok(third);
  assert.equal(third.authorizationDigest,first.authorizationDigest,'digest covers identity, not token bits');
});

test('tampered signatures, wrong issuers and expired tokens fail closed',async t=>{
  const jwks=await startJwks();t.after(()=>jwks.close());
  const adapter=createProductionIdentityAdapter({
    ABH_IDENTITY_JWKS_URL:jwks.url,ABH_IDENTITY_ISSUER:'https://idp.example',
    ABH_IDENTITY_AUDIENCE:'abh-workbench'})!;
  const headersOf=(token:string)=>new Headers({authorization:`Bearer ${token}`});
  const {privateKey:otherKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  assert.equal(await adapter.resolve(headersOf(rs256Token(claimsFor(),otherKey))),null,'foreign key');
  assert.equal(await adapter.resolve(headersOf(rs256Token({...claimsFor(),iss:'https://other.example'}))),null,'issuer');
  assert.equal(await adapter.resolve(headersOf(rs256Token({...claimsFor(),exp:Math.floor(Date.now()/1000)-120}))),null,'expired');
  assert.equal(await adapter.resolve(headersOf(rs256Token({...claimsFor(),aud:'other-app'}))),null,'audience');
  assert.equal(await adapter.resolve(headersOf(rs256Token(claimsFor()).slice(0,-4)+'AAAA')),null,'tampered');
  assert.equal(await adapter.resolve(new Headers({authorization:'Bearer not-a-jwt'})),null,'shape');
  assert.equal(await adapter.resolve(new Headers()),null,'missing');
});

test('HS256 shared-secret deployments verify symmetrically',()=>{
  const adapter=createProductionIdentityAdapter({
    ABH_IDENTITY_SHARED_SECRET:'s3cret-material',ABH_IDENTITY_ISSUER:'https://idp.example',
    ABH_IDENTITY_AUDIENCE:'abh-workbench',ABH_IDENTITY_ORGANIZATION:ORG_A,
    ABH_IDENTITY_ORGANIZATION_LABEL:'Org A'})!;
  const header=Buffer.from(JSON.stringify({alg:'HS256'})).toString('base64url');
  const payload=b64url(claimsFor());
  const signature=createHmac('sha256',Buffer.from('s3cret-material'))
    .update(Buffer.from(`${header}.${payload}`)).digest();
  const token=`${header}.${payload}.${signature.toString('base64url')}`;
  return adapter.resolve(new Headers({authorization:`Bearer ${token}`})).then(session=>{
    assert.ok(session);
    assert.equal(session.actingOrganizationId,ORG_A);
    assert.equal(session.displayName,'Operator One');
  });
});

