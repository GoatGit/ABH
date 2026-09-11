import type {EntityRef,InstalledPackRecord} from '@abh/contracts';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import type {VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {lockFences} from '../control/fences.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {InstalledPackOwner} from './installed-packs.ts';
export interface StagedPackDiscoveryAdmission {
 fenceRefs(tx:TenantTransaction,installation:InstalledPackRecord):Promise<EntityRef[]>;
 /** Deployment-wide discovery policy, also required on empty pages. */
 admit(tx:TenantTransaction):Promise<void>;
 /** Current visibility under retained fences; hidden rows consume scan slots. */
 canRead(tx:TenantTransaction,installation:InstalledPackRecord):Promise<boolean>;
}
/** Tenant-local staged installation hints for management recovery. Uses the current
 * organization-wide data-impact management Grant; each subsequent preparation must
 * revalidate its own signatures, deployment and source authority. No lease, execution,
 * migration completeness or Enable is implied. Sweep again after the final page.
 * The numeric cursor is internal, not an authenticated public API cursor.
 */
export async function discoverStagedPacks(database:Database,context:VerifiedContext,options:TransactionOptions,limit:number,afterDeploymentVersion:number|undefined,
 grantRefs:readonly EntityRef[],checks:StagedPackDiscoveryAdmission):Promise<{candidates:InstalledPackRecord[];scanned:number;next?:number}>{
 if(!Number.isInteger(limit)||limit<1||limit>100||afterDeploymentVersion!==undefined&&(!Number.isSafeInteger(afterDeploymentVersion)||afterDeploymentVersion<0))throw new CoreError('INVALID_ARGUMENT');
 const c=context.tenant;
 if(c.purposeOfUse!=='abh.pack.manage'||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId||!['Human','Service'].includes(c.actor.type))throw new CoreError('FORBIDDEN');
 const grants=structuredClone(grantRefs),limits={...options},fenceRefs=checks.fenceRefs.bind(checks),admit=checks.admit.bind(checks),canRead=checks.canRead.bind(checks),after=afterDeploymentVersion??0;
 return database.transaction(context,limits,async tx=>{
  const active=()=>{tx.assertActive();if(limits.signal.aborted||!Number.isSafeInteger(limits.deadline)||limits.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');};active();
  const rows=await tx.owner('PackLoader')`SELECT id,deployment_version FROM extension.installed_packs
   WHERE resource_organization_id=${c.resourceOrganizationId} AND workspace_id IS NULL AND deleted_at IS NULL
   AND ${c.purposeOfUse}=ANY(purpose_names) AND status='Staged' AND deployment_version>${after}
   ORDER BY deployment_version LIMIT ${limit+1}`;
  const page=rows.slice(0,limit),loaded:InstalledPackRecord[]=[],fences:EntityRef[]=[],owner=new InstalledPackOwner();
  for(const row of page){
   const record=await owner.read(tx,{type:'abh.installed-pack',id:row.id,version:1},async()=>{});active();
   if(record.status!=='Staged'||record.deploymentVersion!==Number(row.deployment_version))throw new CoreError('VERSION_CONFLICT');
   loaded.push(record);fences.push(...structuredClone(await fenceRefs(tx,structuredClone(record))));active();
  }
  const scope={type:'abh.organization',id:c.resourceOrganizationId,version:1};
  await lockFences(tx,[scope,{type:'abh.principal',id:c.actor.id,version:1},...grants,...fences]);
  const authorize=async()=>{await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:'abh.packs.record-data-impact'},grants);await admit(tx);active();};
  await authorize();
  const candidates:InstalledPackRecord[]=[];
  for(const record of loaded){if(await canRead(tx,structuredClone(record)))candidates.push(structuredClone(record));active();}
  await authorize();
  // Recheck Grant after host admission, which may itself withdraw current authority.
  await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:'abh.packs.record-data-impact'},grants);active();
  return {candidates,scanned:page.length,...(rows.length>limit&&page.length?{next:Number(page.at(-1)!.deployment_version)}:{})};
 });
}
