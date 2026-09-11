import type postgres from 'postgres';
import {randomUUID} from 'node:crypto';
import type {EntityRef} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {CoreError} from '../internal/errors.ts';
import {prepareInstalledPack,type InstalledMigrationInput} from './prepare-installed-pack.ts';
import type {PackDataImpactAdmission} from './data-impact-reports.ts';
import type {MigrationStructureExpectation} from './verify-migration-structure.ts';
import type {MigrationDataCheck} from './verify-migration-data.ts';
import {readSignedStructureExpectation,type StoredStructureAdmission} from './read-signed-structure.ts';
import {readSignedDataExpectation,type StoredDataAdmission} from './read-signed-data.ts';
import {verifyStoredMigrationStructure,matchStoredMigrationStructureResult} from './verify-stored-migration-structure.ts';
import {verifyStoredMigrationData,matchStoredMigrationDataResult} from './verify-stored-migration-data.ts';
export interface InstalledStructureInspection {expectation:MigrationStructureExpectation;reportRef:EntityRef;bundleRef:EntityRef;sources:StoredStructureAdmission}
export interface InstalledDataInspection {expectation:readonly MigrationDataCheck[];reportRef:EntityRef;bundleRef:EntityRef;sources:StoredDataAdmission}
/** One installed deployment and one caller-owned read-only REPEATABLE READ target
 * transaction for both observations. Current installation and signature authorities
 * must retain their fences. Declared invariants are not complete domain/backfill/
 * projection verification or Enable authority. Child results retain persistence provenance.
 */
export async function verifyInstalledMigrationState(tx:TenantTransaction,options:TransactionOptions,impactRef:EntityRef,root:string,grants:readonly EntityRef[],checks:PackDataImpactAdmission,
 migration:InstalledMigrationInput,structureInput:InstalledStructureInspection,dataInput:InstalledDataInspection){
 const limits={...options,signal:AbortSignal.any([options.signal,tx.signal])},impact=structuredClone(impactRef),permissions=structuredClone(grants);
 const structure={expectation:structuredClone(structureInput.expectation),reportRef:structuredClone(structureInput.reportRef),bundleRef:structuredClone(structureInput.bundleRef)},data={expectation:structuredClone(dataInput.expectation),reportRef:structuredClone(dataInput.reportRef),bundleRef:structuredClone(dataInput.bundleRef)};
 const admission=migration.admission,policy=canonicalJson(admission.maxLifetimeMs),sql=migration.connection;
 const work:InstalledMigrationInput={connection:sql,steps:structuredClone(migration.steps),signatures:structuredClone(migration.signatures),admission:{maxLifetimeMs:structuredClone(admission.maxLifetimeMs),reportSource:admission.reportSource.bind(admission),supportingFacts:admission.supportingFacts.bind(admission),signature:{signer:admission.signature.signer.bind(admission.signature),source:admission.signature.source.bind(admission.signature)}}};
 const impactChecks={signer:checks.signer.bind(checks),source:checks.source.bind(checks),fenceRefs:checks.fenceRefs.bind(checks),current:checks.current.bind(checks)};
 const structureSource=structureInput.sources.source.bind(structureInput.sources),structureSigner=structureInput.sources.signer.bind(structureInput.sources),dataSource=dataInput.sources.source.bind(dataInput.sources),dataSigner=dataInput.sources.signer.bind(dataInput.sources);
 const active=()=>{tx.assertActive();if(limits.signal.aborted||limits.deadline<=Date.now()||!Number.isSafeInteger(limits.deadline))throw new CoreError('DEPENDENCY_TIMEOUT');if(canonicalJson(admission.maxLifetimeMs)!==policy)throw new CoreError('VERSION_CONFLICT');};active();
 const identity=async()=>{active();const [row]=await sql`SELECT pg_catalog.pg_backend_pid() AS pid,pg_catalog.transaction_timestamp()::text AS started,pg_catalog.pg_current_snapshot()::text AS snapshot,current_setting('transaction_isolation') AS isolation,current_setting('transaction_read_only') AS read_only`;active();if(!row||row.isolation!=='repeatable read'||row.read_only!=='on')throw new CoreError('PRECONDITION_FAILED');return canonicalJson(row);};
 const target=await identity();
 const prepare=async()=>{active();if(await identity()!==target)throw new CoreError('PRECONDITION_FAILED');const value=await prepareInstalledPack(tx,limits,impact,root,permissions,impactChecks,work);active();if(value.status!=='MigrationPrepared')throw new CoreError('PRECONDITION_FAILED');return value;};
 const initial=await prepare();
 let signerConfiguration:string|undefined,dataConfiguration:string|undefined;
 const dataSources:StoredDataAdmission={source:dataSource,signer:async report=>{const config=structuredClone(await dataSigner(report));active();const encoded=canonicalJson(config);if(dataConfiguration!==undefined&&dataConfiguration!==encoded)throw new CoreError('VERSION_CONFLICT');dataConfiguration=encoded;return config;}};
 const sources:StoredStructureAdmission={source:structureSource,signer:async report=>{const config=structuredClone(await structureSigner(report));active();const encoded=canonicalJson(config);if(signerConfiguration!==undefined&&signerConfiguration!==encoded)throw new CoreError('VERSION_CONFLICT');signerConfiguration=encoded;return config;}};
 let observed:Awaited<ReturnType<typeof verifyStoredMigrationStructure>>|undefined;
 const current=async()=>{
  const latest=await prepare();
  if(canonicalJson(latest.installation)!==canonicalJson(initial.installation)||canonicalJson(latest.impact)!==canonicalJson(initial.impact))throw new CoreError('VERSION_CONFLICT');
  if(observed){
   const refreshed=await readSignedStructureExpectation(tx,limits,observed.binding,initial.installation.packRef,structure.reportRef,structure.bundleRef,sources);
   if(canonicalJson(refreshed.report)!==canonicalJson(observed.signature.report))throw new CoreError('VERSION_CONFLICT');
  }
  return {environmentDigest:latest.impact.environmentDigest,deploymentVersion:latest.impact.deploymentVersion};
 };
 observed=await verifyStoredMigrationStructure(tx,sql,limits,initial.installation.manifest,work.steps,structure.expectation,initial.installation.packRef,structure.reportRef,structure.bundleRef,{...sources,current});
 const rows=await verifyStoredMigrationData(tx,sql,limits,initial.installation.manifest,work.steps,data.expectation,initial.installation.packRef,data.reportRef,data.bundleRef,{...dataSources,current});
 await current();
 const finalData=await readSignedDataExpectation(tx,limits,rows.binding,initial.installation.packRef,data.reportRef,data.bundleRef,dataSources);
 if(canonicalJson(finalData.report)!==canonicalJson(rows.signature.report))throw new CoreError('VERSION_CONFLICT');
 active();if(await identity()!==target)throw new CoreError('PRECONDITION_FAILED');
 matchStoredMigrationStructureResult(observed,tx);
 const output={matched:observed.matched&&rows.matched,structure:observed,data:rows};
 const structural=matchStoredMigrationStructureResult(observed,tx),actual=matchStoredMigrationDataResult(rows,tx);
 if(canonicalJson(structural.ownerRef)!==canonicalJson(actual.ownerRef))throw new CoreError('PRECONDITION_FAILED');
 captured.set(output,{tx,connection:sql,structure:observed,data:rows,ownerRef:structural.ownerRef,result:snapshot(output),observedAt:new Date().toISOString(),commandId:randomUUID()});
 return output;
}

export type InstalledMigrationState=Awaited<ReturnType<typeof verifyInstalledMigrationState>>;
function snapshot(value:InstalledMigrationState){
 const structure=matchStoredMigrationStructureResult(value.structure),data=matchStoredMigrationDataResult(value.data);
 return {matched:value.matched,structure:structure.result,data:data.result};
}
const captured=new WeakMap<object,{tx:TenantTransaction;connection:postgres.ReservedSql;structure:InstalledMigrationState['structure'];data:InstalledMigrationState['data'];ownerRef:EntityRef;result:ReturnType<typeof snapshot>;observedAt:string;commandId:string}>();
/** Original same-snapshot aggregate only; separately obtained children cannot mint it. */
export function matchInstalledMigrationState(value:InstalledMigrationState,tx?:TenantTransaction,connection?:postgres.ReservedSql){
 const record=captured.get(value);
 if(!record||connection&&record.connection!==connection||record.structure!==value.structure||record.data!==value.data||tx&&record.tx!==tx||canonicalJson(record.result)!==canonicalJson(snapshot(value)))throw new CoreError('PRECONDITION_FAILED');
 const {tx:producer,connection:target,structure:structural,data:rows,...snapshotRecord}=record;return structuredClone(snapshotRecord);
}
