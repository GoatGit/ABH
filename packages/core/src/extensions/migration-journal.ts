import {randomUUID} from 'node:crypto';
import type postgres from 'postgres';
import type {EntityRef,PackManifest,PackMigrationAttemptRecord,PackMigrationObservationRecord} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {readPackSchemaOwnership} from './schema-ownership.ts';
import {validatePackMigrationPlan} from './pack-migration-plan.ts';
import {digestMigrationExecution} from './migration-evidence.ts';

type ClaimInput=Omit<PackMigrationAttemptRecord,'attemptRef'|'claimedAt'|'stepDigest'|'packId'|'packVersion'|'packageDigest'>;
type ObservationInput=Pick<PackMigrationObservationRecord,'attemptRef'|'kind'|'evidenceRef'>;
export interface NewMigrationClaim {created:boolean;record:PackMigrationAttemptRecord}
const freshClaims=new WeakMap<object,PackMigrationAttemptRecord>();
/** Internal one-use dispatch provenance. Durable recovery/replay cannot mint it. */
export function consumeNewMigrationClaim(claim:NewMigrationClaim):PackMigrationAttemptRecord{
  const record=freshClaims.get(claim);freshClaims.delete(claim);
  if(!record||!claim.created||canonicalJson(record)!==canonicalJson(claim.record))throw new CoreError('PRECONDITION_FAILED');
  return structuredClone(record);
}

async function maintenance(sql:postgres.TransactionSql){
  await sql`SET LOCAL lock_timeout='5s'`;
  await sql`SET LOCAL statement_timeout='10s'`;
  const [actor]=await sql`SELECT current_user AS actor,session_user AS session,
    (has_table_privilege(current_user,'extension.migration_attempts','INSERT') AND has_table_privilege(current_user,'extension.migration_attempts','SELECT')) AS attempts,
    (has_table_privilege(current_user,'extension.migration_observations','INSERT') AND has_table_privilege(current_user,'extension.migration_observations','SELECT')) AS observations`;
  if(!actor||actor.actor!==actor.session||actor.actor.startsWith('abh_')||!actor.attempts||!actor.observations)throw new CoreError('FORBIDDEN');
}
async function readAttempt(row:postgres.Row):Promise<PackMigrationAttemptRecord>{
  const record=contract('PackMigrationAttemptRecord',row.record);
  if(record.attemptRef.id!==row.id||record.packId!==row.pack_id||record.packVersion!==row.pack_version||record.step.ref!==row.migration_ref||record.packageDigest!==row.package_digest||record.stepDigest!==await digestMigrationExecution(record.step))throw new CoreError('PRECONDITION_FAILED');
  return record;
}
function readObservation(row:postgres.Row,attempt:PackMigrationAttemptRecord):PackMigrationObservationRecord{
  const record=contract('PackMigrationObservationRecord',row.record);
  if(record.observationRef.id!==row.id||record.attemptRef.id!==row.attempt_id||record.kind!==row.kind||canonicalJson(record.attemptRef)!==canonicalJson(attempt.attemptRef))throw new CoreError('PRECONDITION_FAILED');
  return record;
}

/** Consistent maintenance recovery snapshot. An empty observation set is unknown
 * execution history, not evidence of no execution. No returned field grants retry,
 * execution or Enable; actual target/evidence verification remains mandatory.
 */
export async function readPackMigrationJournal(database:postgres.Sql,attemptRef:EntityRef):Promise<{attempt:PackMigrationAttemptRecord;observations:PackMigrationObservationRecord[]}>{
  const ref=contract('EntityRef',JSON.parse(canonicalJson(attemptRef)));
  if(ref.type!=='abh.pack-migration-attempt'||ref.version!==1)throw new CoreError('INVALID_ARGUMENT');
  return database.begin('isolation level repeatable read read only',async sql=>{
    await maintenance(sql);
    const [row]=await sql`SELECT * FROM extension.migration_attempts WHERE id=${ref.id}`;
    if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
    const attempt=await readAttempt(row);
    const [pack]=await sql`SELECT package_digest FROM extension.migration_packages WHERE pack_id=${attempt.packId} AND pack_version=${attempt.packVersion}`;
    if(!pack||pack.package_digest!==attempt.packageDigest)throw new CoreError('PRECONDITION_FAILED');
    const rows=await sql`SELECT * FROM extension.migration_observations WHERE attempt_id=${ref.id} ORDER BY kind,id LIMIT 3`;
    if(rows.length>2)throw new CoreError('PRECONDITION_FAILED');
    const observations=rows.map(row=>readObservation(row,attempt));
    if(new Set(observations.map(record=>record.kind)).size!==observations.length)throw new CoreError('PRECONDITION_FAILED');
    return {attempt,observations};
  });
}

/** Maintenance journal only, not current execution admission. Caller must complete
 * the signed installed preparation and retain deployment authority before dispatch.
 * This function commits the claim before returning. Only created=true denotes this
 * invocation's new claim; an existing claim must NEVER cause automatic SQL replay,
 * even if it has no observation (the process may have crashed after SQL committed).
 * A lost response requires recovery from actual database facts, not another claim.
 */
export async function claimPackMigrationAttempt(database:postgres.Sql,manifest:PackManifest,steps:readonly ClaimInput[]){
  const pack=contract('PackManifest',JSON.parse(canonicalJson(manifest)));
  const inputs=JSON.parse(canonicalJson(steps)) as ClaimInput[];
  if(!inputs.length||inputs.length>1000)throw new CoreError('INVALID_ARGUMENT');
  const records=await Promise.all(inputs.map(async input=>contract('PackMigrationAttemptRecord',{
    ...input,attemptRef:{type:'abh.pack-migration-attempt',id:randomUUID(),version:1},claimedAt:new Date().toISOString(),
    packId:pack.metadata.id,packVersion:pack.metadata.version,packageDigest:pack.integrity.packageDigest,stepDigest:await digestMigrationExecution(input.step),
  })));
  const claimed=await database.begin(async sql=>{
    await maintenance(sql);
    // Global table lock also serializes direct maintenance writers. Claims for an
    // entire plan are atomic; no earlier step is left claimable after a collision.
    await sql`LOCK TABLE extension.migration_packages,extension.migration_attempts IN SHARE ROW EXCLUSIVE MODE`;
    const ownership=await readPackSchemaOwnership(sql);
    await validatePackMigrationPlan(pack,ownership,records.map(r=>r.step));
    const [registered]=await sql`SELECT package_digest FROM extension.migration_packages WHERE pack_id=${pack.metadata.id} AND pack_version=${pack.metadata.version}`;
    if(registered&&registered.package_digest!==pack.integrity.packageDigest)throw new CoreError('VERSION_CONFLICT');
    if(!registered)await sql`INSERT INTO extension.migration_packages(pack_id,pack_version,package_digest) VALUES (${pack.metadata.id},${pack.metadata.version},${pack.integrity.packageDigest})`;
    const result:{created:boolean;record:PackMigrationAttemptRecord}[]=[];
    for(const record of records){
      const [row]=await sql`SELECT * FROM extension.migration_attempts WHERE pack_id=${record.packId} AND pack_version=${record.packVersion} AND migration_ref=${record.step.ref}`;
      if(row){
        const existing=await readAttempt(row);
        // Organization/version/environment differences do not make physical SQL
        // repeatable. Return only an exact replay; all other bindings conflict.
        const comparable=(r:PackMigrationAttemptRecord)=>{const {attemptRef:_,claimedAt:__,...rest}=r;return canonicalJson(rest);};
        if(comparable(existing)!==comparable(record))throw new CoreError('VERSION_CONFLICT');
        result.push({created:false,record:existing});continue;
      }
      await sql`INSERT INTO extension.migration_attempts(id,pack_id,pack_version,migration_ref,package_digest,record)
        VALUES (${record.attemptRef.id},${record.packId},${record.packVersion},${record.step.ref},${record.packageDigest},${JSON.stringify(record)}::text::jsonb)`;
      result.push({created:true,record});
    }
    return result;
  });
  // Publish provenance only after PostgreSQL acknowledged the durable commit.
  for(const claim of claimed)if(claim.created)freshClaims.set(claim,structuredClone(claim.record));
  return claimed;
}

/** Append a maintenance observation without changing/removing the original claim.
 * These are caller-attributed facts, NOT verified migration results. In particular,
 * a COMMIT acknowledgement does not allow Enable, and Unknown does not allow retry.
 * Evidence storage/signature and recovery verification remain higher Owner duties.
 */
export async function recordPackMigrationObservation(database:postgres.Sql,input:ObservationInput,admit?:(attempt:PackMigrationAttemptRecord)=>Promise<void>):Promise<PackMigrationObservationRecord>{
  const record=contract('PackMigrationObservationRecord',{
    ...JSON.parse(canonicalJson(input)),observationRef:{type:'abh.pack-migration-observation',id:randomUUID(),version:1},observedAt:new Date().toISOString(),
  });
  return database.begin(async sql=>{
    await maintenance(sql);
    const [attempt]=await sql`SELECT * FROM extension.migration_attempts WHERE id=${record.attemptRef.id} FOR UPDATE`;
    if(!attempt)throw new CoreError('RESOURCE_NOT_FOUND');
    const parent=await readAttempt(attempt);
    // Recovery may validate actual source bytes while this parent row remains
    // locked. Always authorize replay as well as insertion, using an isolated copy.
    await admit?.(structuredClone(parent));
    const [existing]=await sql`SELECT * FROM extension.migration_observations WHERE attempt_id=${record.attemptRef.id} AND kind=${record.kind}`;
    if(existing){
      const previous=readObservation(existing,parent);
      if(canonicalJson(previous.evidenceRef)!==canonicalJson(record.evidenceRef))throw new CoreError('VERSION_CONFLICT');
      await admit?.(structuredClone(parent));
      return previous;
    }
    await sql`INSERT INTO extension.migration_observations(id,attempt_id,kind,record)
      VALUES (${record.observationRef.id},${record.attemptRef.id},${record.kind},${JSON.stringify(record)}::text::jsonb)`;
    // INSERT can wait on indexes/triggers. Recheck admission before allowing this
    // maintenance transaction to commit; failure rolls the observation back.
    await admit?.(structuredClone(parent));
    return record;
  });
}
