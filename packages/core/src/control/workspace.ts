import type { EntityRef } from '@abh/contracts';
import type { TenantTransaction } from '../data/uow.ts';
import { contract } from '../data/journal.ts';
import { CoreError } from '../internal/errors.ts';

export interface CrossOrganizationMembership {
  membershipRef: EntityRef;
  membershipEpoch: number;
  principalVersion: number;
  workspaceVersion: number;
  workspaceEpoch: number;
  fences: readonly {organizationId:string;type:string;id:string;epoch:number}[];
}

/** Source identity proof only; resource Grant/Policy/Responsibility checks remain mandatory. */
export async function verifyWorkspaceMembership(tx: TenantTransaction, membershipRef: EntityRef, localGrantRefs: readonly EntityRef[]): Promise<CrossOrganizationMembership> {
  const c=tx.context.tenant;
  contract('EntityRef',membershipRef);
  if (!c.workspaceId || c.actingOrganizationId===c.resourceOrganizationId || membershipRef.type!=='abh.membership') throw new CoreError('FORBIDDEN');
  if (localGrantRefs.length>100) throw new CoreError('INVALID_ARGUMENT');
  for (const ref of localGrantRefs) {contract('EntityRef',ref);if(ref.type!=='abh.grant')throw new CoreError('INVALID_ARGUMENT');}
  const keys=[
    `${c.actingOrganizationId}/Control/abh.organization/${c.actingOrganizationId}`,
    `${c.actingOrganizationId}/Control/abh.principal/${c.actor.id}`,
    `${c.actingOrganizationId}/Control/abh.membership/${membershipRef.id}`,
    `${c.resourceOrganizationId}/Control/abh.organization/${c.resourceOrganizationId}`,
    `${c.resourceOrganizationId}/Control/abh.workspace/${c.workspaceId}`,
    ...localGrantRefs.map(ref=>`${c.resourceOrganizationId}/Control/abh.grant/${ref.id}`),
  ];
  const sql=tx.owner('Control');
  // A bound text representation avoids SQL interpolation while supporting PostgreSQL uuid[].
  const ids=`{${[...new Set(localGrantRefs.map(ref=>ref.id))].join(',')}}`;
  const rows=await tx.lockMany(1,keys,()=>sql`SELECT * FROM control.verify_workspace_membership(${c.workspaceId!},${membershipRef.id},${membershipRef.version},${ids}::uuid[])`);
  const row=rows[0];
  if (!row) throw new CoreError('FORBIDDEN');
  if (Number(row.credential_epoch)!==c.sessionEpoch || Number(row.workspace_epoch)!==c.scopeEpoch || row.identity_kind!==c.actor.type) throw new CoreError('EPOCH_REVOKED');
  return {membershipRef:{...membershipRef,version:Number(row.membership_version)},membershipEpoch:Number(row.membership_epoch),
    principalVersion:Number(row.principal_version),workspaceVersion:Number(row.workspace_version),workspaceEpoch:Number(row.workspace_epoch),fences:row.fence_vector};
}
