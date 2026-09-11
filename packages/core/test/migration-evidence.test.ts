import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import type {ArtifactRecord,PackManifest,PackMigrationEvidence,PackMigrationStep} from '@abh/contracts';
import {canonicalJson,digestPackManifest} from '@abh/contracts/digest';
import {InlineArtifactOwner} from '../src/data/artifacts.ts';
import {executeCommand,inputDigest} from '../src/data/journal.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import {readMigrationEvidence,readMigrationPlanEvidence,digestMigrationExecution} from '../src/extensions/migration-evidence.ts';
import {packManifest} from './pack-fixture.ts';
import {createDatabaseFixture,context,options} from './database-fixture.ts';
const ref={type:'abh.artifact',id:'11111111-1111-4111-8111-111111111111',version:2},digest='sha256:'+'a'.repeat(64);
test('migration evidence reads and binds actual current Artifact contents',{timeout:120_000},async t=>{
 const f=await createDatabaseFixture();t.after(()=>f.close());
 const c=deriveVerifiedContext({...context().request,purposeOfUse:'abh.pack.manage'}),owner=new InlineArtifactOwner();
 const step:PackMigrationStep={ref:'migration.sql',digest,schemas:['hello_domain'],databaseRole:'hello_migrator',phase:'Expand',transactional:true,operations:['Create'],reviewRef:ref,dryRunRef:ref,safetyPointRef:ref,recoveryPlanRef:ref,compatibilityRef:ref};
 const binding={packageDigest:digest,environmentDigest:digest,deploymentVersion:1};
 const base={organizationId:c.tenant.resourceOrganizationId,...binding,stepDigest:await digestMigrationExecution(step),status:'Passed' as const,issuedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+60000).toISOString(),supportingRefs:[ref]};
 const store=async(content:string)=>{
  const payload={ownerRef:{type:'abh.organization',id:c.tenant.resourceOrganizationId,version:1},mediaType:'application/json',content,purposeNames:['abh.pack.manage'],dataClass:'abh.data.internal',sourceRefs:[],region:'local',retentionPolicyRef:ref};
  const cmd={type:'abh.artifacts.store-inline',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(payload)};let result:ArtifactRecord|undefined;
  await f.database.transaction(c,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>{result=await owner.store(tx,cmd,payload,async()=>{});return result.artifactRef;}));return result!.artifactRef;
 };
 for(const [kind,key] of [['Review','reviewRef'],['DryRun','dryRunRef'],['SafetyPoint','safetyPointRef'],['RecoveryPlan','recoveryPlanRef'],['Compatibility','compatibilityRef']] as const)step[key]=await store(canonicalJson({...base,kind}));
 const evidenceCalls:string[]=[];
 const admission={maxLifetimeMs:{Review:120000,DryRun:120000,SafetyPoint:120000,RecoveryPlan:120000,Compatibility:120000,Retirement:120000},source:async()=>{},evidence:async(_artifact:ArtifactRecord,evidence:PackMigrationEvidence)=>{evidenceCalls.push(evidence.kind);}};
 const read=(candidate=step)=>f.database.transaction(c,options(),tx=>readMigrationEvidence(tx,candidate,binding,admission));
 assert.equal((await read()).length,5);assert.deepEqual(evidenceCalls,['Review','DryRun','SafetyPoint','RecoveryPlan','Compatibility']);
 await t.test('execution changes invalidate evidence while evidence IDs do not create a digest cycle',async()=>{
  for(const patch of [{databaseRole:'other_migrator'},{schemas:['other_domain']},{transactional:false},{operations:['Alter'] as PackMigrationStep['operations']}])await assert.rejects(read({...step,...patch}),{code:'PRECONDITION_FAILED'});
  assert.equal(await digestMigrationExecution(step),base.stepDigest);
 });
 await t.test('wrong kind, status, tenant, environment, deployment and validity reject',async()=>{
  for(const patch of [{kind:'DryRun'},{status:'Failed'},{organizationId:randomUUID()},{environmentDigest:'sha256:'+'b'.repeat(64)},{deploymentVersion:2},{expiresAt:new Date(Date.now()-1).toISOString()},{issuedAt:new Date(Date.now()+10000).toISOString()}]){
   const replacement=await store(canonicalJson({...base,kind:'Review',...patch}));
   await assert.rejects(read({...step,reviewRef:replacement}),{code:'PRECONDITION_FAILED'});
  }
 });
 await t.test('noncanonical and duplicate-key report JSON cannot pass',async()=>{
  const json=canonicalJson({...base,kind:'Review'});
  for(const content of [json+' ',json.replace('{','{"status":"Failed",')])await assert.rejects(read({...step,reviewRef:await store(content)}),{code:'INVALID_ARGUMENT'});
 });
 await t.test('source authority and independent evidence verification are both mandatory',async()=>{
  const denied=new Error('issuer verification denied');
  for(const key of ['source','evidence'] as const)await assert.rejects(f.database.transaction(c,options(),tx=>readMigrationEvidence(tx,step,binding,{...admission,[key]:async()=>{throw denied;}})),error=>error===denied);
 });
 await t.test('per-kind lifetime policy rejects excessive validity and invalid settings',async()=>{
  for(const [kind,value] of [['Review',100],['SafetyPoint',100],['Retirement',0],['DryRun',NaN]] as const){
   const policy={...admission,maxLifetimeMs:{...admission.maxLifetimeMs,[kind]:value}};
   await assert.rejects(f.database.transaction(c,options(),tx=>readMigrationEvidence(tx,step,binding,policy)),{code:value>0?'PRECONDITION_FAILED':'INVALID_ARGUMENT'});
  }
 });
 await t.test('last verifier cannot silently replace the policy used for earlier reports',async()=>{
  const policy={...admission,maxLifetimeMs:{...admission.maxLifetimeMs},evidence:async(_artifact:ArtifactRecord,evidence:PackMigrationEvidence)=>{if(evidence.kind==='Compatibility')policy.maxLifetimeMs.Review=300000;}};
  await assert.rejects(f.database.transaction(c,options(),tx=>readMigrationEvidence(tx,step,binding,policy)),{code:'VERSION_CONFLICT'});
 });
 await t.test('one microsecond beyond maximum lifetime cannot pass by Date truncation',async()=>{
  const issued=Math.floor(Date.now()/1000)*1000-1000;
  const issuedAt=new Date(issued).toISOString(),expiresAt=new Date(issued+10000).toISOString().replace('.000Z','.000001Z');
  const reviewRef=await store(canonicalJson({...base,kind:'Review',issuedAt,expiresAt}));
  await assert.rejects(f.database.transaction(c,options(),tx=>readMigrationEvidence(tx,{...step,reviewRef},binding,{...admission,maxLifetimeMs:{...admission.maxLifetimeMs,Review:10000}})),{code:'PRECONDITION_FAILED'});
 });
 await t.test('expiry during the final evidence verifier invalidates earlier reports',async()=>{
  const expires=Date.now()+300;
  const reviewRef=await store(canonicalJson({...base,kind:'Review',expiresAt:new Date(expires).toISOString()}));
  await assert.rejects(f.database.transaction(c,options(),tx=>readMigrationEvidence(tx,{...step,reviewRef},binding,{...admission,evidence:async(_artifact,evidence)=>{
   if(evidence.kind==='Compatibility')await new Promise(resolve=>setTimeout(resolve,Math.max(1,expires-Date.now()+10)));
  }})),{code:'PRECONDITION_FAILED'});
 });
 await t.test('whole plan binds declared migrations and rechecks first-step expiry after later steps',async()=>{
  const pack=await packManifest() as PackManifest;pack.trust.mode='TrustedCode';pack.resources={enforcement:'HostProfile',profileRef:ref};
  const next={...step,ref:'second.sql',phase:'Backfill' as const,operations:['DataWrite'] as PackMigrationStep['operations']};
  pack.migrations=[step,next].map(item=>({ref:item.ref,digest:item.digest,sizeBytes:9,mediaType:'application/sql'}));
  const {signaturePayload:_,...digests}=await digestPackManifest(pack);Object.assign(pack.integrity,digests);
  const owners=[{packId:pack.metadata.id,schemaName:'hello_domain',databaseRole:'hello_migrator'}];
  const plan=[structuredClone(step),next];
  for(const item of plan)for(const [kind,key] of [['Review','reviewRef'],['DryRun','dryRunRef'],['SafetyPoint','safetyPointRef'],['RecoveryPlan','recoveryPlanRef'],['Compatibility','compatibilityRef']] as const)
   item[key]=await store(canonicalJson({...base,packageDigest:pack.integrity.packageDigest,stepDigest:await digestMigrationExecution(item),kind}));
  const readPlan=(checks=admission)=>f.database.transaction(c,options(),tx=>readMigrationPlanEvidence(tx,pack,owners,plan,binding,checks));
  assert.equal((await readPlan()).length,2);
  let attempted=false;
  await readPlan({...admission,source:async()=>{
   if(attempted)return;attempted=true;
   await assert.rejects(f.admin.begin(async sql=>{
    await sql`SET LOCAL lock_timeout='50ms'`;
    await sql`UPDATE data.artifacts SET updated_at=CURRENT_TIMESTAMP WHERE id=${plan[1]!.compatibilityRef.id}`;
   }),{code:'55P03'});
  }});
  assert.equal(attempted,true);
  await assert.rejects(f.database.transaction(c,options(),tx=>readMigrationPlanEvidence(tx,pack,owners,plan.slice(0,1),binding,admission)),{code:'PRECONDITION_FAILED'});
  const expires=Date.now()+500;
  plan[0]!.reviewRef=await store(canonicalJson({...base,packageDigest:pack.integrity.packageDigest,stepDigest:await digestMigrationExecution(plan[0]!),kind:'Review',expiresAt:new Date(expires).toISOString()}));
  const last=await digestMigrationExecution(plan[1]!);
  await assert.rejects(readPlan({...admission,evidence:async(_artifact,evidence)=>{
   if(evidence.stepDigest===last&&evidence.kind==='Compatibility')await new Promise(resolve=>setTimeout(resolve,Math.max(1,expires-Date.now()+10)));
  }}),{code:'PRECONDITION_FAILED'});
 });

});
