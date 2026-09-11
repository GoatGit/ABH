import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {CompatibleQueryEvidence,EntityRef,GrantRecord} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import {contract,inputDigest} from '../src/data/journal.ts';
import {InlineArtifactOwner} from '../src/data/artifacts.ts';
import {recordCompatibleQueryEvidence,type CompatibleQueryEvidenceAdmission} from '../src/execution/record-compatible-query-evidence.ts';
import {revokeGrant} from '../src/control/revoke.ts';
import {CoreError} from '../src/internal/errors.ts';
import type {VerifiedContext} from '../src/internal/context.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import type {createDatabaseFixture} from './database-fixture.ts';
import {options} from './database-fixture.ts';

/** Review material is test-installed; actual command/Grant/fences, journal,
 * proof storage, replay and revocation use production Owners. */
export async function checkCompatibleEvidenceIssuance(f:Awaited<ReturnType<typeof createDatabaseFixture>>,context:VerifiedContext,
 evidence:CompatibleQueryEvidence,reviewSources:EntityRef[],grantTemplate:GrantRecord){
 const database=f.database,org=context.tenant.resourceOrganizationId,scope={type:'abh.organization',id:org,version:1};
 const identity=async(type:string,value:unknown)=>({type,commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(value)});
 const grant:GrantRecord={...grantTemplate,grantRef:{type:'abh.grant',id:randomUUID(),version:1},actionTypes:['abh.operations.record-compatible-query-evidence']};
 await database.transaction(context,options(),async tx=>{
  await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${grant.grantRef.id},${grant.principalRef.id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
  await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${grant.grantRef.id},1)`;
 });
 const review={kind:'InstalledCompatibleQueryReview',evidence,sourceRefs:reviewSources};
 const retention={dataClass:'abh.data.internal',region:'local',retentionPolicyRef:scope},payload={...retention,ownerRef:evidence.operationRef,mediaType:'application/json',purposeNames:['abh.operation.reconcile'],content:canonicalJson(review),sourceRefs:reviewSources};
 const store=await identity('abh.artifacts.store-inline',payload),artifacts=new InlineArtifactOwner();
 const source=await database.transaction(context,options(),tx=>artifacts.store(tx,store,payload,async()=>{}));
 const command=contract('RecordCompatibleQueryEvidenceCommand',{type:grant.actionTypes[0],schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),target:{type:'abh.organization',id:org},payload:{evidence,reviewRef:source.artifactRef,retention}});
 let allowed=true,reviewCalls=0;
 const checks:CompatibleQueryEvidenceAdmission={fenceRefs:async()=>[],review:async(_tx,proof,record,bytes)=>{
  reviewCalls++;if(!allowed)throw new CoreError('POLICY_DENIED');
  assert.deepEqual(proof,evidence);assert.deepEqual(record.artifactRef,source.artifactRef);assert.deepEqual(JSON.parse(new TextDecoder().decode(bytes)),review);
 },storage:async(_tx,input)=>{assert.deepEqual(input.retentionPolicyRef,scope);assert.deepEqual(input.sourceRefs,[source.artifactRef]);}};
 const invoke=(grants:readonly EntityRef[]=[grant.grantRef],admission=checks,input=command)=>recordCompatibleQueryEvidence(database,context,options(),input,grants,admission);
 const counts=async()=>{const [row]=await f.admin`SELECT (SELECT count(*) FROM data.artifacts) AS artifacts,(SELECT count(*) FROM execution.query_exits) AS exits,(SELECT count(*) FROM data.command_receipts) AS commands`;return {...row};};
 const before=await counts();
 await assert.rejects(invoke([]),{code:'AUTHORITY_REQUIRED'});assert.equal(reviewCalls,0);
 await assert.rejects(invoke([grantTemplate.grantRef]),{code:'FORBIDDEN'});
 allowed=false;await assert.rejects(invoke(),{code:'POLICY_DENIED'});allowed=true;
 await assert.rejects(recordCompatibleQueryEvidence(database,deriveVerifiedContext({...context.request,purposeOfUse:'abh.action.prepare'}),options(),command,[grant.grantRef],checks),{code:'PURPOSE_DENIED'});
 for(const patch of [{operationRef:{...evidence.operationRef,version:evidence.operationRef.version+1}},{connectionRef:{...evidence.connectionRef,id:randomUUID()}},{accountRef:{...evidence.accountRef,id:randomUUID()}},{originalConnectorRef:{...evidence.originalConnectorRef,version:'9.0.0'}}]){
  await assert.rejects(invoke([grant.grantRef],checks,{...command,payload:{...command.payload,evidence:{...evidence,...patch}}}),error=>error instanceof CoreError&&['VERSION_CONFLICT','PIN_INPUT_CONFLICT','RESOURCE_NOT_FOUND','AUTHORITY_REQUIRED'].includes(error.code));
 }
 const revoke=await identity('abh.grants.revoke',grant.grantRef);
 await assert.rejects(invoke([grant.grantRef],{...checks,storage:async tx=>{await revokeGrant(tx,revoke,grant.grantRef,[scope]);}}),error=>error instanceof CoreError&&['EPOCH_REVOKED','AUTHORITY_REQUIRED'].includes(error.code));
 const tombstone=await identity('abh.artifacts.tombstone',source.artifactRef);
 await assert.rejects(invoke([grant.grantRef],{...checks,storage:async tx=>{await artifacts.tombstone(tx,tombstone,source.artifactRef,scope,async()=>{});}}),{code:'VERSION_CONFLICT'});
 assert.deepEqual(await counts(),before,'denied issuance rolls back all artifacts and receipts');
 let currentChecks=0;
 await assert.rejects(invoke([grant.grantRef],{...checks,review:async()=>{if(++currentChecks===2)throw new CoreError('POLICY_DENIED');}}),{code:'POLICY_DENIED'});
 assert.equal(currentChecks,2);assert.deepEqual(await counts(),before,'final review denial rolls back newly stored proof');
 await assert.rejects(invoke([grant.grantRef],{...checks,review:async()=>{}},{...command,payload:{...command.payload,evidence:{...evidence,expiresAt:'2000-01-01T00:00:00Z'}}}),{code:'PRECONDITION_FAILED'});
 const lockedChecks={...checks,review:async(...args:Parameters<CompatibleQueryEvidenceAdmission['review']>)=>{
  await checks.review(...args);
  await assert.rejects(f.admin.begin(async sql=>{await sql`SELECT id FROM data.artifacts WHERE id=${source.artifactRef.id} FOR UPDATE NOWAIT`;}),{code:'55P03'});
 }};
 const accepted=await invoke([grant.grantRef],lockedChecks),replayed=await invoke();assert.deepEqual(replayed,{...accepted,replayed:true});
 const saved=await database.transaction(context,options(),tx=>artifacts.read(tx,accepted.artifactRef,async()=>{}));
 assert.deepEqual(JSON.parse(new TextDecoder().decode(saved.bytes)),evidence);assert.deepEqual(saved.record.sourceRefs,[source.artifactRef]);
 const after=await counts();assert.equal(Number(after.artifacts),Number(before.artifacts)+1);assert.equal(after.exits,before.exits);assert.equal(Number(after.commands),Number(before.commands)+1);
 allowed=false;await assert.rejects(invoke(),{code:'POLICY_DENIED'});allowed=true;
 await assert.rejects(invoke([grant.grantRef],checks,{...command,payload:{...command.payload,retention:{...retention,region:'different'}}}),{code:'IDEMPOTENCY_CONFLICT'});
 await database.transaction(context,options(),tx=>revokeGrant(tx,revoke,grant.grantRef,[scope]));
 await assert.rejects(invoke(),error=>error instanceof CoreError&&['EPOCH_REVOKED','AUTHORITY_REQUIRED'].includes(error.code));
 assert.deepEqual(await counts(),after);
 return saved.record;
}
