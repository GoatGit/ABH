import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,realpath,readFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {digestBytes,digestPackManifest} from '@abh/contracts/digest';
import {validateContract} from '@abh/contracts/schema';
import {defineBusiness} from '@abh/core';
import {runPack} from '../src/pack.mjs';

async function invoke(args,environment=undefined,signal=new AbortController().signal){
  let stdout='',stderr='';const code=await runPack(args,{env:environment??{},stdout:{write:value=>{stdout+=value;}},
    stderr:{write:value=>{stderr+=value;}},signal});return {code,stdout,stderr};}
async function policy(){return {abhVersion:'0.1.0',packId:'org.example.hello',allowedModes:['Declarative'],allowedLicenses:['Apache-2.0'],
  permissions:{dataClasses:[],purposes:[],commands:[],toolCapabilities:[],networkEgress:[],secretClasses:[]},
  hostProfileRefs:[],sharedNamespaces:[]};}
async function fixture(){
  const root=await realpath(await mkdtemp(join(tmpdir(),'abh-pack-validate-')));await mkdir(join(root,'pack/proof'),{recursive:true});
  const bytes=new TextEncoder().encode('abc'),value={apiVersion:'abh.open/v1',kind:'DomainPack',
    metadata:{id:'org.example.hello',version:'1.0.0',license:'Apache-2.0'},compatibility:{abh:'>=0.1.0 <1.0.0'},
    trust:{mode:'Declarative'},capabilities:{provides:[],requires:[]},
    permissions:{dataClasses:[],purposes:[],commands:[],toolCapabilities:[],networkEgress:[],secretClasses:[]},
    resources:{enforcement:'None'},artifacts:[{ref:'input.json',sizeBytes:3,mediaType:'application/json',digest:await digestBytes(bytes)}],
    migrations:[],conformance:{suiteVersion:'1.0.0'}};
  const {signaturePayload:_,...digests}=await digestPackManifest(value);
  const manifest={...value,integrity:{...digests,signatureFormat:'application/vnd.dev.sigstore.bundle.v0.3+json',
    signatureRef:'proof/signature.json',provenanceRef:'proof/source.json',conformanceRef:'proof/ctk.json'}};
  const manifestCheck=validateContract('PackManifest',manifest);if(!manifestCheck.success)throw new Error(JSON.stringify(manifestCheck.issues));
  const policyCheck=validateContract('PackDeploymentPolicy',await policy());if(!policyCheck.success)throw new Error(JSON.stringify(policyCheck.issues));
  await writeFile(join(root,'pack/input.json'),bytes);
  for(const name of ['signature','source','ctk'])await writeFile(join(root,'pack/proof',name+'.json'),'{}');
  await writeFile(join(root,'manifest.json'),JSON.stringify(manifest));
  await writeFile(join(root,'policy.json'),JSON.stringify(await policy()));
  return {root,manifest,policy:await policy(),cleanup:()=>rm(root,{recursive:true,force:true})};
}

test('abh pack validate performs bounded local content and policy preflight',async t=>{
  const base=['validate','--format','json'];
  for(const args of [[],['--unknown','x'],['--root','a','--root','b'],['--timeout-ms','99'],['--timeout-ms','1e3'],
    ['--format','xml']]){const out=await invoke([...base,...args]);assert.equal(out.code,2);assert.equal(out.stdout,'');}
  const {root,manifest,policy,cleanup}=await fixture();t.after(cleanup);
  const flags=[...base,'--root',join(root,'pack'),'--manifest',join(root,'manifest.json'),'--policy',join(root,'policy.json')];
  const passed=await invoke(flags);if(passed.code!==0)throw new Error(`stdout=${passed.stdout} stderr=${passed.stderr}`);
  const record=JSON.parse(passed.stdout);assert.equal(validateContract('CliPackValidateResult',record).success,true);
  assert.equal(record.status,'Passed');assert.equal(record.diagnostic.packId,'org.example.hello');
  assert.equal(record.diagnostic.artifactCount,1);assert.equal(record.commandRef,null);assert.deepEqual(record.evidenceRefs,[]);
  const textFlags=['validate','--format','text','--root',join(root,'pack'),'--manifest',join(root,'manifest.json'),'--policy',join(root,'policy.json')];
  assert.equal((await invoke(textFlags)).stdout.includes('org.example.hello@1.0.0'),true);
  await writeFile(join(root,'pack/input.json'),'abd');
  const mismatch=await invoke(flags);assert.equal(mismatch.code,4);const failed=JSON.parse(mismatch.stdout);
  assert.equal(validateContract('CliPackValidateResult',failed).success,true);
  assert.equal(failed.errorCode,'PRECONDITION_FAILED');assert.equal(failed.diagnostic,null);
  await writeFile(join(root,'pack/input.json'),'abc');
  await writeFile(join(root,'policy.json'),JSON.stringify({...policy,packId:'org.other.pack'}));
  const denied=await invoke(flags);assert.equal(denied.code,3);assert.equal(JSON.parse(denied.stdout).errorCode,'FORBIDDEN');
});

test('abh pack build writes one deterministic unsigned local manifest',async t=>{
  const base=['build','--format','json'];
  for(const args of [[],['--unknown','x'],['--root','a','--root','b'],['--timeout-ms','99'],['--format','xml']])
    {const out=await invoke([...base,...args]);assert.equal(out.code,2);assert.equal(out.stdout,'');}
  const root=await realpath(await mkdtemp(join(tmpdir(),'abh-pack-build-cli-')));t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'pack'),{recursive:true});const bytes=new TextEncoder().encode('abc');
  const value={apiVersion:'abh.open/v1',kind:'DomainPack',
    metadata:{id:'org.example.build',version:'1.0.0',license:'Apache-2.0'},compatibility:{abh:'>=0.1.0 <1.0.0'},
    trust:{mode:'Declarative'},capabilities:{provides:[],requires:[]},
    permissions:{dataClasses:[],purposes:[],commands:[],toolCapabilities:[],networkEgress:[],secretClasses:[]},
    resources:{enforcement:'None'},artifacts:[{ref:'payload.txt',mediaType:'text/plain'}],
    migrations:[],conformance:{suiteVersion:'1.0.0'}};
  await writeFile(join(root,'pack/payload.txt'),bytes);await writeFile(join(root,'draft.json'),JSON.stringify(value));
  const output=join(root,'manifest.json'),flags=[...base,'--root',join(root,'pack'),'--manifest',join(root,'draft.json'),'--output',output];
  const passed=await invoke(flags);if(passed.code!==0)throw new Error(`stdout=${passed.stdout} stderr=${passed.stderr}`);
  const record=JSON.parse(passed.stdout);assert.equal(validateContract('CliPackBuildResult',record).success,true);
  assert.equal(record.status,'Passed');assert.equal(record.diagnostic.packId,'org.example.build');
  assert.equal(record.diagnostic.outputBytes,(await stat(output)).size);
  const manifest=JSON.parse(await readFile(output,'utf8'));assert.equal(validateContract('PackManifest',manifest).success,true);
  assert.equal(manifest.artifacts[0].digest,await digestBytes(bytes));
  assert.equal((await invoke(flags)).code,6);assert.equal(JSON.parse((await invoke(flags)).stdout).errorCode,'DEPENDENCY_UNAVAILABLE');
  await writeFile(join(root,'pack/extra.txt'),'x');
  const output2=join(root,'manifest2.json');const denied=await invoke([...flags.slice(0,-2),'--output',output2]);
  assert.equal(denied.code,2);
});

test('abh pack compile-business writes a deterministic local candidate and CTK plan',async t=>{
  const base=['compile-business','--format','json'];
  for(const args of [[],['--unknown','x'],['--business','a','--business','b'],['--timeout-ms','99'],['--format','xml']])
    {const out=await invoke([...base,...args]);assert.equal(out.code,2);assert.equal(out.stdout,'');}
  const root=await realpath(await mkdtemp(join(tmpdir(),'abh-business-cli-')));t.after(()=>rm(root,{recursive:true,force:true}));
  const business=await defineBusiness({name:'hello.business',version:'0.1.0',mode:'ActionOnly',
    actions:[{actionType:'hello.publish',title:'Publish internal brief',description:'Propose one approved brief.',
      inputSchema:{type:'object',properties:{message:{type:'string',minLength:1,maxLength:200}},required:['message'],additionalProperties:false},
      executionPrincipalRef:{type:'abh.principal',id:'00000000-0000-4000-8000-000000000001',version:1},
      completionPolicyRef:{type:'abh.principal',id:'00000000-0000-4000-8000-000000000002',version:1},
      riskClass:'hello.low-risk',requiredBehaviorSlots:['hello.execution'],maxOperations:1,intentExpirySeconds:3600,
      purposeNames:['abh.action.prepare']}]});
  const businessPath=join(root,'business.json');await writeFile(businessPath,JSON.stringify(business));
  const output=join(root,'manifest.json'),flags=[...base,'--business',businessPath,'--output',output];
  const passed=await invoke(flags);if(passed.code!==0)throw new Error(`stdout=${passed.stdout} stderr=${passed.stderr}`);
  const record=JSON.parse(passed.stdout);assert.equal(validateContract('CliPackBuildResult',record).success,true);
  assert.equal(record.diagnostic.packId,'hello.business');assert.equal(record.diagnostic.artifactCount,1);
  const manifest=JSON.parse(await readFile(output,'utf8'));
  assert.equal(validateContract('PackManifest',manifest).success,true);
  const declaration=JSON.parse(await readFile(join(root,'manifest.business.json'),'utf8'));
  const ctk=JSON.parse(await readFile(join(root,'manifest.ctk-plan.json'),'utf8'));
  assert.match(declaration.digest,/^sha256:[0-9a-f]{64}$/);
  assert.equal(manifest.artifacts[0].digest,await digestBytes(await readFile(join(root,'manifest.business.json'))));
  assert.equal(ctk.status,'NotRun');
  assert.equal(ctk.subjectDigest,manifest.integrity.packageDigest);
  const retry=await invoke(flags);assert.equal(retry.code,6);assert.equal(JSON.parse(retry.stdout).errorCode,'DEPENDENCY_UNAVAILABLE');
  await writeFile(businessPath,JSON.stringify({...business,digest:'sha256:'+'0'.repeat(64)}));
  const invalid=await invoke([...flags.slice(0,-2),'--output',join(root,'other.json')]);assert.equal(invalid.code,2);
  assert.equal(JSON.parse(invalid.stdout).errorCode,'INVALID_ARGUMENT');
});

test('abh pack sign resolves key by environment reference and never emits secret material',async t=>{
  const base=['sign','--format','json'];
  for(const args of [[],['--unknown','x'],['--manifest','a','--manifest','b'],['--timeout-ms','99'],['--format','xml']])
    {const out=await invoke([...base,...args]);assert.equal(out.code,2);assert.equal(out.stdout,'');}
  const root=await realpath(await mkdtemp(join(tmpdir(),'abh-pack-sign-cli-')));t.after(()=>rm(root,{recursive:true,force:true}));
  const bytes=new TextEncoder().encode('abc'),value={apiVersion:'abh.open/v1',kind:'DomainPack',
    metadata:{id:'org.example.sign',version:'1.0.0',license:'Apache-2.0'},compatibility:{abh:'>=0.1.0 <1.0.0'},
    trust:{mode:'Declarative'},capabilities:{provides:[],requires:[]},
    permissions:{dataClasses:[],purposes:[],commands:[],toolCapabilities:[],networkEgress:[],secretClasses:[]},
    resources:{enforcement:'None'},artifacts:[{ref:'payload.txt',sizeBytes:3,mediaType:'text/plain',digest:await digestBytes(bytes)}],
    migrations:[],conformance:{suiteVersion:'1.0.0'}};
  const {signaturePayload:_,...digests}=await digestPackManifest(value);
  const manifest={...value,integrity:{...digests,signatureFormat:'application/vnd.dev.sigstore.bundle.v0.3+json',
    signatureRef:'signatures/bundle.json',provenanceRef:'provenance/source.json',conformanceRef:'ctk/report.json'}};
  const path=join(root,'manifest.json');await writeFile(path,JSON.stringify(manifest));
  const output=join(root,'bundle.json'),flags=[...base,'--manifest',path,'--pack-id','org.example.sign',
    '--cosign','/nonexistent/cosign','--key-ref','ABH_TEST_PACK_KEY','--public-key-ref','ABH_TEST_PACK_PUBLIC','--output',output];
  const missing=await invoke(flags);assert.equal(missing.code,6,`stdout=${missing.stdout} stderr=${missing.stderr}`);
  assert.equal(validateContract('CliPackSignResult',JSON.parse(missing.stdout)).success,true);
  assert.equal(JSON.parse(missing.stdout).errorCode,'DEPENDENCY_UNAVAILABLE');
  const invalid=await invoke([...flags.slice(0,-2),'--output',join(root,'bundle2.json')],
    {ABH_TEST_PACK_KEY:'secret-material',ABH_TEST_PACK_PUBLIC:'public-material'});
  assert.equal(invalid.code,2);assert.equal(invalid.stdout.includes('secret-material'),false);
  assert.equal(JSON.parse(invalid.stdout).errorCode,'INVALID_ARGUMENT');
  await assert.equal(await stat(output).then(()=>true,()=>false),false);
});

test('abh pack verify runs bounded local signature provenance and CTK admission',async t=>{
  const base=['verify','--format','json'];
  for(const args of [[],['--unknown','x'],['--root','a','--root','b'],['--timeout-ms','99'],['--format','xml']])
    {const out=await invoke([...base,...args]);assert.equal(out.code,2);assert.equal(out.stdout,'');}
  const {root,policy,cleanup}=await fixture();t.after(cleanup);
  const key='-----BEGIN PUBLIC KEY-----\nYWJj\n-----END PUBLIC KEY-----\n';
  const signer={executable:'/nonexistent/cosign',mode:'OfflinePublicKey',publicKeyPem:key,packId:'org.example.hello'};
  const trust={signer,
    provenance:{...signer,subjectName:'payload',builderId:'https://example.test/builder',
      buildType:'https://example.test/build',source:{uri:'git+https://example.test/hello',digest:{sha256:'a'.repeat(64)}}},
    conformance:{...signer,subjectName:'payload',suiteVersion:'1.0.0',
      environment:{profile:'Domain',environmentDigest:'sha256:'+'b'.repeat(64),fixtureSetDigest:'sha256:'+'c'.repeat(64),seed:'42'},
      cases:[{caseId:'abh.test.integrity',status:'Passed'}],claimedCapabilities:[],maxAgeMs:60000}};
  const trustPath=join(root,'trust.json');await writeFile(trustPath,JSON.stringify(trust));
  await writeFile(join(root,'pack/proof/signature.json'),JSON.stringify({mediaType:'application/vnd.dev.sigstore.bundle.v0.3+json'}));
  const flags=[...base,'--root',join(root,'pack'),'--manifest',join(root,'manifest.json'),
    '--policy',join(root,'policy.json'),'--trust',trustPath];
  const proofFailure=await invoke(flags);assert.equal(proofFailure.code,4);
  const failed=JSON.parse(proofFailure.stdout);assert.equal(validateContract('CliPackVerifyResult',failed).success,true);
  assert.equal(failed.errorCode,'PRECONDITION_FAILED');assert.equal(failed.diagnostic,null);
  await writeFile(join(root,'policy.json'),JSON.stringify({...policy,packId:'org.other.pack'}));
  const denied=await invoke(flags);assert.equal(denied.code,3);assert.equal(JSON.parse(denied.stdout).errorCode,'FORBIDDEN');
  await writeFile(join(root,'policy.json'),JSON.stringify(policy));
  await writeFile(trustPath,JSON.stringify({...trust,signer:{...trust.signer,executable:'cosign'}}));
  const invalid=await invoke(flags);assert.equal(invalid.code,2);assert.equal(JSON.parse(invalid.stdout).errorCode,'INVALID_ARGUMENT');
});
