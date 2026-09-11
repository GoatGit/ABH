import assert from 'node:assert/strict';
import type {EntityRef} from '@abh/contracts';
import type {VerifiedContext} from '../src/internal/context.ts';
import type {createDatabaseFixture} from './database-fixture.ts';
import {inspectPackInspectionJob,type PackInspectionDiagnostic} from '../src/extensions/inspect-pack-inspection-job.ts';
const options=()=>({deadline:Date.now()+10000,signal:new AbortController().signal});
export async function checkPackInspectionDiagnostic(f:Awaited<ReturnType<typeof createDatabaseFixture>>,c:VerifiedContext,ref:EntityRef,grants:readonly EntityRef[],expected:PackInspectionDiagnostic['nextStep']){
 const org=c.tenant.resourceOrganizationId;
 const counts=async()=>{
  const [row]=await f.admin`SELECT (SELECT count(*) FROM data.command_receipts WHERE resource_organization_id=${org}) AS receipts,
   (SELECT count(*) FROM data.outbox WHERE resource_organization_id=${org}) AS outbox,
   (SELECT count(*) FROM data.audit_records WHERE resource_organization_id=${org}) AS audit,
   (SELECT sum(version) FROM extension.inspection_jobs WHERE resource_organization_id=${org}) AS jobs,
   (SELECT sum(version) FROM runtime.work_leases WHERE resource_organization_id=${org}) AS leases`;
  return {...row};
 };
 const before=await counts();let admitted=0,artifacts=0;
 const checks={fenceRefs:async()=>[],current:async(_tx:unknown,job:{jobRef:EntityRef})=>{admitted++;job.jobRef.id='callback-mutation';},read:async()=>{artifacts++;}};
 const result=await inspectPackInspectionJob(f.database,c,options(),ref,grants,checks);
 assert.equal(result.nextStep,expected);assert.equal(result.jobRef.id,ref.id);assert.ok(result.jobRef.version>=ref.version);assert.equal(admitted,2);
 assert.ok(result.remainingDurationMs>=0);assert.ok(result.remainingAttempts>=0);assert.equal(artifacts,result.evidenceRefs.length);
 assert.deepEqual(await counts(),before);
 await assert.rejects(inspectPackInspectionJob(f.database,c,options(),ref,[],checks),{code:'AUTHORITY_REQUIRED'});
 await assert.rejects(inspectPackInspectionJob(f.database,c,options(),{...ref,version:999999},grants,checks),{code:'VERSION_CONFLICT'});
 await assert.rejects(inspectPackInspectionJob(f.database,c,options(),ref,grants,{...checks,current:async()=>{throw new Error('diagnostic denied');}}),/diagnostic denied/);
 if(result.evidenceRefs.length)await assert.rejects(inspectPackInspectionJob(f.database,c,options(),ref,grants,{...checks,read:async()=>{throw new Error('evidence denied');}}),/evidence denied/);
 assert.deepEqual(await counts(),before);
 return result;
}
