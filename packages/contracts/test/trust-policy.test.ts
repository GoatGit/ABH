import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateContract} from '../src/schema.ts';
const key={mode:'OfflinePublicKey',executable:'/opt/abh/cosign',publicKeyPem:'-----BEGIN PUBLIC KEY-----\nYWJj\n-----END PUBLIC KEY-----\n',packId:'org.example.hello'};
const digest='sha256:'+'0'.repeat(64);
const snapshot=()=>({policyRef:{type:'abh.pack-trust-policy',id:'11111111-1111-4111-8111-111111111111',version:1},
 policy:{abhVersion:'0.1.0',packId:key.packId,allowedModes:['Declarative'],allowedLicenses:['MIT'],permissions:{dataClasses:[],purposes:[],commands:[],toolCapabilities:[],networkEgress:[],secretClasses:[]},hostProfileRefs:[],sharedNamespaces:[]},
 trust:{signer:{...key},provenance:{...key,subjectName:'payload',builderId:'builder',buildType:'build',source:{uri:'git+https://example.org/repo',digest:{gitCommit:'abc'}}},
 conformance:{...key,subjectName:'payload',suiteVersion:'1.0.0',environment:{profile:'Domain',environmentDigest:digest,fixtureSetDigest:digest,seed:'1'},cases:[{caseId:'abh.test.case',status:'Passed'}],claimedCapabilities:[],maxAgeMs:1000}},
 revokedPackIds:[],revokedDigests:[],reservedVersions:[]});
test('governance contracts close nested policy fields and reject mixed namespaces or duplicate requirements',()=>{
 const value=snapshot();assert.equal(validateContract('PackGovernanceSnapshot',value).success,true);
 const patches=[{trust:{...value.trust,signer:{...key,packId:'org.other.pack'}}},
  {trust:{...value.trust,provenance:{...value.trust.provenance,source:{uri:'git',digest:{}}}}},
  {trust:{...value.trust,conformance:{...value.trust.conformance,cases:[...value.trust.conformance.cases,...value.trust.conformance.cases]}}},
  {policy:{...value.policy,permissions:{...value.policy.permissions,undeclared:['grant']}}},
  {policy:{...value.policy,isolated:{available:true,limits:{cpuMillis:-1}}}},
  {trust:{...value.trust,signer:{...key,executable:'cosign'}}},
  {revokedDigests:[digest,digest]},
  {extra:true}];
 for(const patch of patches)assert.equal(validateContract('PackGovernanceSnapshot',{...value,...patch}).success,false);
});
test('signed policy envelope validates nested governance and timestamp ordering',()=>{
 const document={organizationId:'22222222-2222-4222-8222-222222222222',issuedAt:'2026-09-08T00:00:00Z',expiresAt:'2026-09-08T01:00:00Z',snapshot:snapshot()};
 assert.equal(validateContract('SignedTrustPolicyDocument',document).success,true);
 for(const patch of [{expiresAt:document.issuedAt},{organizationId:'not-uuid'},{grant:{}},{snapshot:{...document.snapshot,revokedDigests:[digest,digest]}}])
  assert.equal(validateContract('SignedTrustPolicyDocument',{...document,...patch}).success,false);
});
