import type { EntityRef, GrantRecord, Target } from '@abh/contracts';
import { createContractCatalog, validateRegisteredTarget } from '@abh/contracts/catalog';
import type { TenantTransaction } from '../data/uow.ts';
import { contract } from '../data/journal.ts';
import { CoreError } from '../internal/errors.ts';
import { currentIdentity } from '../identity/owner.ts';
import { lockFences } from './fences.ts';

/** Grant admission is one input to Control; it does not issue an Action Snapshot or Dispatch Permit. */
export async function assertCurrentGrants(tx: TenantTransaction, target: Target, grantRefs: readonly EntityRef[],
  options:{lock?:boolean}={}): Promise<GrantRecord[]> {
  const c=tx.context.tenant;
  contract('Target',target);
  const catalog=createContractCatalog();
  if (!catalog.success || !validateRegisteredTarget(catalog.data,target,c.purposeOfUse).success) throw new CoreError('FORBIDDEN');
  if (!grantRefs.length || grantRefs.length>100 || new Set(grantRefs.map(g=>g.id)).size!==grantRefs.length) throw new CoreError('AUTHORITY_REQUIRED');
  const organization={type:'abh.organization',id:c.resourceOrganizationId,version:1};
  const scopes=[organization,{type:'abh.principal',id:c.actor.id,version:1},...target.scopeRefs,...grantRefs];
  for (const grant of grantRefs) if (grant.type!=='abh.grant') throw new CoreError('INVALID_ARGUMENT');
  // Current first-party scope binding; foreign scopes require the dedicated cross-organization verifier.
  if (target.scopeRefs.some(scope=>scope.type!=='abh.organization'||scope.id!==c.resourceOrganizationId)) throw new CoreError('FORBIDDEN');
  if (target.objectRef.type==='abh.organization' && target.objectRef.id!==c.resourceOrganizationId) throw new CoreError('FORBIDDEN');
  const fences=options.lock===false?[]:await lockFences(tx,scopes);
  if (fences.some(fence=>fence.stopFlag)) throw new CoreError('EPOCH_REVOKED');
  const current=await currentIdentity(tx);
  if (current.scopeEpoch!==c.scopeEpoch) throw new CoreError('EPOCH_REVOKED');
  const grants: GrantRecord[]=[];
  for (const grantRef of [...grantRefs].sort((a,b)=>a.id<b.id?-1:1)) {
    contract('EntityRef',grantRef);
    const rows=await tx.owner('Control')`SELECT record,version,status,principal_id,valid_from,valid_until FROM control.grants
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${grantRef.id} AND deleted_at IS NULL AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)
      AND valid_from<=clock_timestamp() AND valid_until>clock_timestamp()`;
    const row=rows[0];
    if (!row || row.status!=='Active' || row.principal_id!==c.actor.id || Number(row.version)!==grantRef.version) throw new CoreError('AUTHORITY_REQUIRED');
    const grant=contract('GrantRecord',row.record);
    if (grant.grantRef.id!==grantRef.id || grant.grantRef.version!==grantRef.version || grant.principalRef.id!==c.actor.id || grant.resourceOrganizationId!==c.resourceOrganizationId
      || grant.status!==row.status || Date.parse(grant.validFrom)!==row.valid_from.getTime() || Date.parse(grant.validUntil)!==row.valid_until.getTime()) throw new CoreError('INTERNAL_ERROR');
    if (!grant.actionTypes.includes(target.action) || !grant.purposeNames.includes(c.purposeOfUse)
      || !grant.scopeRefs.some(scope=>scope.type==='abh.organization' && scope.id===c.resourceOrganizationId || scope.type===target.objectRef.type && scope.id===target.objectRef.id)) throw new CoreError('FORBIDDEN');
    grants.push(grant);
  }
  return grants;
}
