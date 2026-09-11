import type {ArtifactRecord,Digest,EntityRef,PackMigrationEvidence,PackMigrationStep,PackManifest,PackSchemaOwnership} from '@abh/contracts';
import {canonicalJson,digestBytes} from '@abh/contracts/digest';
import type {TenantTransaction} from '../data/uow.ts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {validatePackMigrationPlan} from './pack-migration-plan.ts';

export interface MigrationEvidenceAdmission {
  /** Current deployment policy, allowing shorter safety-point/dry-run lifetimes. */
  maxLifetimeMs:Readonly<Record<PackMigrationEvidence['kind'],number>>;
  source(artifact:ArtifactRecord,kind:PackMigrationEvidence['kind']):Promise<void>;
  /** Independently verify issuer/signature and actual supporting outcomes under current authority fences. */
  evidence(artifact:ArtifactRecord,evidence:PackMigrationEvidence):Promise<void>;
}
/** Evidence references are excluded to avoid a report-content / Artifact-ID cycle. */
export async function digestMigrationExecution(step:PackMigrationStep):Promise<Digest>{
  const input=contract('PackMigrationStep',JSON.parse(canonicalJson(step)));
  const {ref,digest,schemas,databaseRole,phase,transactional,operations}=input;
  return digestBytes(new TextEncoder().encode(canonicalJson({ref,digest,schemas,databaseRole,phase,transactional,operations})));
}
/** Resolve actual Available artifact bytes, not Ref presence. The caller must hold
 * deployment/governance fences before acquiring the complete evidence source row set.
 * Passed is only a reported outcome; the mandatory evidence callback verifies its truth.
 */
export async function readMigrationEvidence(tx:TenantTransaction,step:PackMigrationStep,binding:{packageDigest:Digest;environmentDigest:Digest;deploymentVersion:number},admission:MigrationEvidenceAdmission):Promise<Array<{ref:EntityRef;evidence:PackMigrationEvidence}>>{
  const input=contract('PackMigrationStep',JSON.parse(canonicalJson(step))),expected={...binding};
  const kinds=['Review','DryRun','SafetyPoint','RecoveryPlan','Compatibility','Retirement'] as const;
  const lifetimes={...admission.maxLifetimeMs};
  if(Object.keys(lifetimes).length!==kinds.length||kinds.some(kind=>!Number.isSafeInteger(lifetimes[kind])||lifetimes[kind]<1))throw new CoreError('INVALID_ARGUMENT');
  contract('Digest',expected.packageDigest);contract('Digest',expected.environmentDigest);
  if(!Number.isSafeInteger(expected.deploymentVersion)||expected.deploymentVersion<1)throw new CoreError('INVALID_ARGUMENT');
  const c=tx.context.tenant;
  if(c.purposeOfUse!=='abh.pack.manage'||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
  const refs:Array<[PackMigrationEvidence['kind'],EntityRef]>=[['Review',input.reviewRef],['DryRun',input.dryRunRef],['SafetyPoint',input.safetyPointRef],['RecoveryPlan',input.recoveryPlanRef],['Compatibility',input.compatibilityRef]];
  if(input.retirementRef)refs.push(['Retirement',input.retirementRef]);
  const owner=new InlineArtifactOwner();await owner.lockSources(tx,refs.map(([,ref])=>ref));
  const stepDigest=await digestMigrationExecution(input),result:Array<{ref:EntityRef;evidence:PackMigrationEvidence}>=[];
  for(const [kind,ref] of refs){
    const source=await owner.read(tx,ref,async artifact=>{
      if(artifact.mediaType!=='application/json'||artifact.sizeBytes>65536)throw new CoreError('INVALID_ARGUMENT');
      await admission.source(structuredClone(artifact),kind);
    });
    let evidence:PackMigrationEvidence;
    try{
      const text=new TextDecoder('utf-8',{fatal:true}).decode(source.bytes);
      evidence=contract('PackMigrationEvidence',JSON.parse(text));
      if(canonicalJson(evidence)!==text)throw new Error();
    }catch{throw new CoreError('INVALID_ARGUMENT');}
    if(evidence.kind!==kind||evidence.status!=='Passed'||evidence.organizationId!==c.resourceOrganizationId||evidence.packageDigest!==expected.packageDigest||evidence.stepDigest!==stepDigest||evidence.environmentDigest!==expected.environmentDigest||evidence.deploymentVersion!==expected.deploymentVersion)throw new CoreError('PRECONDITION_FAILED');
    assertEvidenceCurrent(evidence,lifetimes);await admission.evidence(structuredClone(source.record),structuredClone(evidence));
    result.push({ref,evidence});
  }
  if(canonicalJson(admission.maxLifetimeMs)!==canonicalJson(lifetimes))throw new CoreError('VERSION_CONFLICT');
  for(const {evidence} of result)assertEvidenceCurrent(evidence,lifetimes);
  tx.assertActive();return result;
}

export function assertEvidenceCurrent(evidence:PackMigrationEvidence,lifetimes:MigrationEvidenceAdmission['maxLifetimeMs']):void{
  const micros=(value:string)=>{
    const [whole,fraction='']=value.slice(0,-1).split('.');
    return BigInt(Date.parse(whole+'Z'))*1000n+BigInt(fraction.padEnd(6,'0'));
  };
  const issued=micros(evidence.issuedAt),expires=micros(evidence.expiresAt),now=BigInt(Date.now())*1000n;
  if(issued>now||expires<=now||expires-issued>BigInt(lifetimes[evidence.kind])*1000n)throw new CoreError('PRECONDITION_FAILED');
}

/** Validate the whole declared plan before reading any evidence; lock all evidence rows
 * together so two plans cannot acquire the same sources in opposite step order.
 * This returns verified reports, never a migration execution permit.
 */
export async function readMigrationPlanEvidence(tx:TenantTransaction,manifest:PackManifest,ownership:readonly PackSchemaOwnership[],steps:readonly PackMigrationStep[],binding:{environmentDigest:Digest;deploymentVersion:number},admission:MigrationEvidenceAdmission):Promise<Array<{step:PackMigrationStep;reports:Array<{ref:EntityRef;evidence:PackMigrationEvidence}>}>>{
  const pack=contract('PackManifest',JSON.parse(canonicalJson(manifest))),expected={...binding},lifetimes={...admission.maxLifetimeMs};
  const plan=await validatePackMigrationPlan(pack,ownership,steps);
  const c=tx.context.tenant;
  if(c.purposeOfUse!=='abh.pack.manage'||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
  contract('Digest',expected.environmentDigest);
  if(!Number.isSafeInteger(expected.deploymentVersion)||expected.deploymentVersion<1)throw new CoreError('INVALID_ARGUMENT');
  const refs=plan.flatMap(step=>[step.reviewRef,step.dryRunRef,step.safetyPointRef,step.recoveryPlanRef,step.compatibilityRef,...(step.retirementRef?[step.retirementRef]:[])]);
  if(refs.length>10000)throw new CoreError('LIMIT_EXCEEDED');
  await new InlineArtifactOwner().lockSources(tx,refs);
  const result=[];
  for(const step of plan)result.push({step,reports:await readMigrationEvidence(tx,step,{...expected,packageDigest:pack.integrity.packageDigest},admission)});
  if(canonicalJson(admission.maxLifetimeMs)!==canonicalJson(lifetimes))throw new CoreError('VERSION_CONFLICT');
  for(const {reports} of result)for(const {evidence} of reports)assertEvidenceCurrent(evidence,lifetimes);
  tx.assertActive();return result;
}
