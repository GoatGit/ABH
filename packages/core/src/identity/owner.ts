import type { PrincipalRecord, OrganizationRecord, MembershipRecord } from '@abh/contracts';
import type { TenantTransaction } from '../data/uow.ts';
import { contract } from '../data/journal.ts';
import { CoreError } from '../internal/errors.ts';

/** Current local membership is authoritative; IdP group claims are never a Grant. */
export async function currentIdentity(tx: TenantTransaction): Promise<{
  organization: OrganizationRecord; principal: PrincipalRecord; membership: MembershipRecord; scopeEpoch: number;
}> {
  const c=tx.context.tenant;
  if (c.actingOrganizationId!==c.resourceOrganizationId) throw new CoreError('FORBIDDEN');
  const rows=await tx.owner('Identity')`SELECT
    o.id AS organization_id,o.version AS organization_version,o.name,o.home_region,o.status AS organization_status,
    p.id AS principal_id,p.version AS principal_version,p.display_name,p.identity_kind,p.status AS principal_status,p.credential_epoch,
    m.id AS membership_id,m.version AS membership_version,m.status AS membership_status,m.membership_epoch,
    f.epoch AS scope_epoch,f.stop_flag
    FROM identity.organizations o
    JOIN identity.principals p ON p.resource_organization_id=o.resource_organization_id AND p.id=${c.actor.id}
    JOIN identity.memberships m ON m.resource_organization_id=o.resource_organization_id AND m.principal_id=p.id
    JOIN control.fences f ON f.resource_organization_id=o.resource_organization_id AND f.scope_type='abh.organization' AND f.scope_id=o.id
    WHERE o.resource_organization_id=${c.resourceOrganizationId} AND o.id=${c.resourceOrganizationId}
      AND o.deleted_at IS NULL AND p.deleted_at IS NULL AND m.deleted_at IS NULL AND f.deleted_at IS NULL`;
  const row=rows[0];
  if (!row || row.organization_status!=='Active' || row.principal_status!=='Active' || row.membership_status!=='Active' || row.stop_flag) throw new CoreError('FORBIDDEN');
  if (row.identity_kind!==c.actor.type || Number(row.credential_epoch)!==c.sessionEpoch) throw new CoreError('EPOCH_REVOKED');
  const principal=contract('PrincipalRecord',{principalRef:{type:'abh.principal',id:row.principal_id,version:Number(row.principal_version)},resourceOrganizationId:c.resourceOrganizationId,
    displayName:row.display_name,identityKind:row.identity_kind,status:row.principal_status,credentialEpoch:Number(row.credential_epoch)});
  return {
    organization:contract('OrganizationRecord',{organizationRef:{type:'abh.organization',id:row.organization_id,version:Number(row.organization_version)},
      resourceOrganizationId:c.resourceOrganizationId,name:row.name,homeRegion:row.home_region,status:row.organization_status}),
    principal,
    membership:contract('MembershipRecord',{membershipRef:{type:'abh.membership',id:row.membership_id,version:Number(row.membership_version)},resourceOrganizationId:c.resourceOrganizationId,
      principalRef:principal.principalRef,status:row.membership_status,membershipEpoch:Number(row.membership_epoch)}),
    scopeEpoch:Number(row.scope_epoch),
  };
}
