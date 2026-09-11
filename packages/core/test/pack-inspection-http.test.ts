import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import type {GrantRecord} from '@abh/contracts';
import {validateContract} from '@abh/contracts/schema';
import {createDatabaseFixture,context,options} from './database-fixture.ts';
import {contract,inputDigest} from '../src/data/journal.ts';
import {IdentityIngress} from '../src/identity/ingress.ts';
import {createCoreHttpApp} from '../src/server/http.ts';
import {createAbhClient} from '@abh/core/client';
import {CoreError} from '../src/internal/errors.ts';

test('inspection HTTP query authenticates a Service, checks current discovery authority and never writes progress',{timeout:60000},async t=>{
 const f=await createDatabaseFixture();t.after(()=>f.close());
 const seed=context(),org=seed.tenant.resourceOrganizationId,id=seed.tenant.actor.id;
 const ref=<T extends string>(type:T,value:string=randomUUID())=>({type,id:value,version:1});
 const issuer='development.fake',audience='abh.diagnostic',subject='fixture-inspector',identityDigest=await inputDigest([issuer,subject]);
 await f.admin`INSERT INTO deployment.identity_locations(identity_digest,resource_organization_id,principal_id,principal_version) VALUES (${identityDigest},${org},${id},1)`;
 const grant:GrantRecord={grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:ref('abh.principal',id),scopeRefs:[ref('abh.organization',org)],actionTypes:['abh.packs.record-data-impact'],purposeNames:['abh.pack.manage'],validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+60000).toISOString(),issuanceEvidenceRef:ref('abh.decision'),status:'Active'};
 const now=new Date().toISOString(),job=contract('PackInspectionJobRecord',{jobRef:ref('abh.pack-inspection-job'),resourceOrganizationId:org,packRef:ref('abh.installed-pack'),packageDigest:'sha256:'+'a'.repeat(64),environmentDigest:'sha256:'+'b'.repeat(64),deploymentVersion:1,kind:'StructureAndDataInspection',status:'Pending',requestedBy:ref('abh.principal',id),commandId:randomUUID(),idempotencyKey:randomUUID(),requestedAt:now,updatedAt:now,expiresAt:new Date(Date.now()+60000).toISOString(),budget:{maxAttempts:3,attempts:0,maxDurationMs:30000,elapsedMs:0}});
 await f.database.transaction(seed,options(),async tx=>{
  await tx.owner('Identity')`INSERT INTO identity.organizations(resource_organization_id,id,name,home_region,status) VALUES (${org},${org},'Fixture','local','Active')`;
  await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status) VALUES (${org},${id},'Inspector','Service',1,'Active')`;
  await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status) VALUES (${org},${randomUUID()},${id},1,'Active')`;
  await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${grant.grantRef.id},${id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
  for(const scope of [grant.grantRef,grant.principalRef,...grant.scopeRefs])await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},${scope.type},${scope.id},1)`;
  await tx.owner('PackLoader')`INSERT INTO extension.inspection_jobs(resource_organization_id,id,purpose_names,pack_id,package_digest,environment_digest,deployment_version,status,record) VALUES (${org},${job.jobRef.id},${['abh.pack.manage']},${job.packRef.id},${job.packageDigest},${job.environmentDigest},1,'Pending',${JSON.stringify(job)}::text::jsonb)`;
 });
 const foreign={...job,resourceOrganizationId:randomUUID(),jobRef:ref('abh.pack-inspection-job')};
 await f.admin`INSERT INTO extension.inspection_jobs(resource_organization_id,id,purpose_names,pack_id,package_digest,environment_digest,deployment_version,status,record,created_by,updated_by) VALUES (${foreign.resourceOrganizationId},${foreign.jobRef.id},${['abh.pack.manage']},${foreign.packRef.id},${foreign.packageDigest},${foreign.environmentDigest},1,'Pending',${JSON.stringify(foreign)}::text::jsonb,${id},${id})`;
 const ingress=new IdentityIngress(f.database,{verify:async()=>({status:'Completed',data:{issuer,audience,subject,identityKind:'Service',authnStrength:{level:'Workload'},credentialEpoch:1,verifiedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString(),evidenceRef:ref('abh.identity-evidence')}})},{issuer,audience});
 let denied=false,grants= [grant.grantRef];
 const admission={fenceRefs:async()=>[],current:async()=>{if(denied)throw new CoreError('FORBIDDEN');},read:async()=>{throw new Error('Pending has no evidence to read');}};
 const installation={database:f.database,identity:ingress,credentials:async(request:{headers:Record<string,unknown>})=>{
  if(request.headers.authorization!=='Bearer fixture-credential')throw new CoreError('UNAUTHENTICATED');
  return {credentialRef:ref('abh.credential'),organizationId:org,purpose:'abh.pack.manage'};
 },packInspectionDiagnostic:{grants:async()=>grants,admission}};
 const app=createCoreHttpApp(installation);t.after(()=>app.close());
 installation.packInspectionDiagnostic={grants:async()=>{throw new Error('replacement must not run');},admission};
 const path='/v1/queries/abh.pack-inspection-jobs.inspect',headers={authorization:'Bearer fixture-credential'};
 const counts=async()=>{const [row]=await f.admin`SELECT (SELECT count(*) FROM data.command_receipts) AS receipts,(SELECT count(*) FROM data.audit_records) AS audit,(SELECT count(*) FROM data.outbox) AS outbox,(SELECT record FROM extension.inspection_jobs WHERE id=${job.jobRef.id}) AS job`;return {...row};};
 const before=await counts();
 const address=await app.listen({host:'127.0.0.1',port:0});
 const client=createAbhClient({baseUrl:address,headers:async()=>headers});
 const cli=async()=>{
  try{const output=await promisify(execFile)(process.execPath,[new URL('../../cli/bin/abh.mjs',import.meta.url).pathname,'doctor','inspection','--id',job.jobRef.id,'--format','json'],{env:{...process.env,ABH_API_BASE_URL:address,ABH_API_TOKEN:'fixture-credential'},timeout:15000});return {...output,code:0};}
  catch(error){const output=error as {code:number;stdout:string;stderr:string};assert.equal(typeof output.code,'number');return output;}
 };
 const reported=await cli();assert.equal(reported.code,0,reported.stderr);const cliBody=JSON.parse(reported.stdout);assert.equal(validateContract('CliInspectionDiagnosticResult',cliBody).success,true);assert.equal(cliBody.status,'Reported');assert.deepEqual(cliBody.diagnostic.jobRef,job.jobRef);assert.equal(cliBody.diagnostic.nextStep,'AwaitDelivery');assert.equal(reported.stderr,'');
 const queried=await client.packInspections.inspect({id:job.jobRef.id});assert.equal(queried.data.nextStep,'AwaitDelivery');
 for(const suffix of ['', '&consistency=Strong']){
  const response=await app.inject({method:'GET',url:`${path}?id=${job.jobRef.id}${suffix}`,headers});assert.equal(response.statusCode,200,response.body);const body=response.json();assert.equal(validateContract('PackInspectionDiagnosticResponse',body).success,true);assert.equal(body.data.nextStep,'AwaitDelivery');assert.deepEqual(body.data.jobRef,job.jobRef);assert.equal(body.meta.asOf,body.data.assessedAt);assert.equal(body.meta.stale,false);assert.match(body.meta.watermark,/^pack-inspection-source\/sha256:/);
 }
 assert.equal((await app.inject({method:'GET',url:`${path}?id=${job.jobRef.id}`})).statusCode,401);
 assert.equal((await app.inject({method:'GET',url:`${path}?id=${job.jobRef.id}&consistency=Projection`,headers})).statusCode,400);
 for(const query of ['id=invalid',`id=${job.jobRef.id}&extra=true`])assert.equal((await app.inject({method:'GET',url:`${path}?${query}`,headers})).statusCode,400);
 for(const inaccessible of [randomUUID(),foreign.jobRef.id])assert.equal((await app.inject({method:'GET',url:`${path}?id=${inaccessible}`,headers})).statusCode,404);
 denied=true;assert.equal((await app.inject({method:'GET',url:`${path}?id=${job.jobRef.id}`,headers})).statusCode,404);denied=false;
 grants=[];assert.equal((await app.inject({method:'GET',url:`${path}?id=${job.jobRef.id}`,headers})).statusCode,404);grants=[grant.grantRef];
 await f.admin`UPDATE control.grants SET status='Revoked' WHERE id=${grant.grantRef.id}`;
 assert.equal((await app.inject({method:'GET',url:`${path}?id=${job.jobRef.id}`,headers})).statusCode,404);
 const rejected=await cli();assert.equal(rejected.code,4);assert.equal(JSON.parse(rejected.stdout).errorCode,'RESOURCE_NOT_FOUND');assert.equal(JSON.parse(rejected.stdout).diagnostic,null);
 assert.deepEqual(await counts(),before);
});
