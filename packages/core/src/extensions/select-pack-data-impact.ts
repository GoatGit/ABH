import type {Digest,EntityRef} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {recoverImpactCheckedPack,type PackDataImpactAdmission} from './data-impact-reports.ts';
/** Select only a unique live report for an exact installation/environment/deployment.
 * Missing and Ambiguous are recovery hints, never applicability or completion proofs.
 * Selection admission must authorize discovery (including missing/ambiguous results)
 * and retain all selection and later impact authority fences in canonical order.
 * Selected reports still undergo actual signatures, sources, content and deployment
 * verification. Recheck the candidate set under the recovered deployment lock.
 */
export async function selectCurrentPackDataImpact(tx:TenantTransaction,options:TransactionOptions,packRef:EntityRef,environmentDigest:Digest,deploymentVersion:number,
 root:string,grants:readonly EntityRef[],checks:PackDataImpactAdmission,admit:(tx:TenantTransaction)=>Promise<void>){
 const pack=contract('EntityRef',structuredClone(packRef)),environment=contract('Digest',environmentDigest),permissions=structuredClone(grants),limits={...options,signal:AbortSignal.any([options.signal,tx.signal])},authorize=admit;
 const policy={signer:checks.signer.bind(checks),source:checks.source.bind(checks),fenceRefs:checks.fenceRefs.bind(checks),current:checks.current.bind(checks)},c=tx.context.tenant;
 if(pack.type!=='abh.installed-pack'||pack.version!==1||!Number.isSafeInteger(deploymentVersion)||deploymentVersion<1)throw new CoreError('INVALID_ARGUMENT');
 if(c.purposeOfUse!=='abh.pack.manage'||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
 const active=()=>{tx.assertActive();if(limits.signal.aborted||limits.deadline<=Date.now()||!Number.isSafeInteger(limits.deadline))throw new CoreError('DEPENDENCY_TIMEOUT');};active();
 const candidates=async()=>{const rows=await tx.owner('PackLoader')`SELECT id FROM extension.data_impact_reports
  WHERE resource_organization_id=${c.resourceOrganizationId} AND workspace_id IS NULL AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names)
  AND record->'packRef'=${JSON.stringify(pack)}::text::jsonb AND record->>'environmentDigest'=${environment}
  AND record->>'deploymentVersion'=${String(deploymentVersion)}
  AND (record->>'issuedAt')::timestamptz<=clock_timestamp() AND (record->>'expiresAt')::timestamptz>clock_timestamp()
  ORDER BY id LIMIT 2`;active();return rows.map(row=>({type:'abh.pack-data-impact',id:String(row.id),version:1}));};
 await authorize(tx);active();const first=await candidates();
 if(first.length!==1){await authorize(tx);active();return {status:first.length?'Ambiguous' as const:'Missing' as const};}
 let recovered=await recoverImpactCheckedPack(tx,limits,first[0]!,root,permissions,policy),report=recovered.impact();active();
 if(canonicalJson(report.packRef)!==canonicalJson(pack)||report.environmentDigest!==environment||report.deploymentVersion!==deploymentVersion)throw new CoreError('PRECONDITION_FAILED');
 await authorize(tx);active();
 const refreshed=await recoverImpactCheckedPack(tx,limits,first[0]!,root,permissions,policy);active();
 if(canonicalJson(refreshed.impact())!==canonicalJson(report)||canonicalJson(refreshed.installation())!==canonicalJson(recovered.installation()))throw new CoreError('VERSION_CONFLICT');
 recovered=refreshed;const latest=await candidates();
 if(latest.length!==1||canonicalJson(latest[0])!==canonicalJson(first[0]))throw new CoreError('VERSION_CONFLICT');
 return {status:'Selected' as const,impactRef:first[0]!,recovered};
}
