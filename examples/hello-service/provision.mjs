import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';

/** One-time provisioning for the hello-service example (run against a migrated database,
 *  as a role that may write identity/control data and create one deployment-owned table):

 *    ABH_PROVISION_ADMIN_URL   admin/migration role connection (DDL + role grants)
 *    ABH_ORGANIZATION_ID       organization UUID to provision (created if missing)
 *    ABH_SERVICE_TOKEN         must match the service; drives the identity digest

 *  The identity digest must byte-match Core's inputDigest([issuer, subject]) so that
 *  IdentityIngress.locateIdentity finds this row. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function canonicalJson(value) {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(item => canonicalJson(item) ?? 'null').join(',')}]`;
  const entries = Object.keys(value).sort()
    .filter(key => value[key] !== undefined)
    .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
  return `{${entries.join(',')}}`;
}

function identityDigest(issuer, subject) {
  const body = canonicalJson([issuer, subject]);
  return `sha256:${createHash('sha256').update(body).digest('hex')}`;
}

function stableUuid(seed) {
  const hex = createHash('sha256').update(seed).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const adminUrl = process.env.ABH_PROVISION_ADMIN_URL;
const organizationId = process.env.ABH_ORGANIZATION_ID;
const token = process.env.ABH_SERVICE_TOKEN;
if (!adminUrl) throw new Error('ABH_PROVISION_ADMIN_URL required');
if (!organizationId || !UUID.test(organizationId)) throw new Error('ABH_ORGANIZATION_ID must be a UUID');
if (!token || token.length < 16) throw new Error('ABH_SERVICE_TOKEN required');

const issuer = 'urn:abh:hello-service', audience = 'abh-hello-service';
const principalId = stableUuid(`principal/${issuer}/${organizationId}`);
const subject = 'hello-operator';
const grantId = stableUuid(`grant/${issuer}/${organizationId}`);
const membershipId = stableUuid(`membership/${issuer}/${organizationId}`);
const orgFenceId = stableUuid(`fence/org/${organizationId}`);
const principalFenceId = stableUuid(`fence/principal/${organizationId}`);
const grantFenceId = stableUuid(`fence/grant/${organizationId}`);
const authorityId = stableUuid(`authority/${issuer}/${organizationId}`);
const now = new Date(), inOneYear = new Date(Date.now() + 365 * 86_400_000);

const grant = {
  grantRef: { type: 'abh.grant', id: grantId, version: 1 },
  resourceOrganizationId: organizationId,
  principalRef: { type: 'abh.principal', id: principalId, version: 1 },
  scopeRefs: [{ type: 'abh.organization', id: organizationId, version: 1 }],
  actionTypes: ['abh.missions.read', 'abh.missions.create', 'abh.missions.activate',
    'abh.missions.pause', 'abh.missions.resume', 'abh.missions.cancel'],
  purposeNames: ['abh.mission.manage'],
  validFrom: now.toISOString(), validUntil: inOneYear.toISOString(),
  issuanceEvidenceRef: { type: 'abh.organization', id: organizationId, version: 1 },
  status: 'Active',
};

const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
try {
  await admin.begin(async tx => {
    // Audit columns read these session settings; bootstrapping uses the provisioned principal.
    await tx`SELECT set_config('abh.actor_id', ${principalId}, true),
      set_config('abh.purpose_of_use', 'abh.mission.manage', true)`;
    await tx`INSERT INTO identity.organizations(resource_organization_id,id,name,home_region,status)
      VALUES (${organizationId},${organizationId},'Hello Service','local','Active')
      ON CONFLICT (resource_organization_id,id) DO NOTHING`;
    await tx`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status)
      VALUES (${organizationId},${principalId},'Hello Operator','Human',1,'Active')
      ON CONFLICT (resource_organization_id,id) DO NOTHING`;
    await tx`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status)
      VALUES (${organizationId},${membershipId},${principalId},1,'Active')
      ON CONFLICT (resource_organization_id,principal_id) DO NOTHING`;
    await tx`INSERT INTO deployment.identity_locations(identity_digest,resource_organization_id,principal_id,principal_version)
      VALUES (${identityDigest(issuer, subject)},${organizationId},${principalId},1)
      ON CONFLICT (identity_digest,resource_organization_id) DO NOTHING`;
    await tx`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status)
      VALUES (${organizationId},${grantId},${principalId},${JSON.stringify(grant)}::text::jsonb,
        ${grant.validFrom},${grant.validUntil},'Active')
      ON CONFLICT (resource_organization_id,id) DO NOTHING`;
    await tx`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch)
      VALUES (${organizationId},${orgFenceId},'abh.organization',${organizationId},1),
             (${organizationId},${principalFenceId},'abh.principal',${principalId},1),
             (${organizationId},${grantFenceId},'abh.grant',${grantId},1)
      ON CONFLICT (resource_organization_id,scope_type,scope_id) DO NOTHING`;
  });
  // Restricted service roles must not connect with the admin/maintenance credentials.
  if (process.env.ABH_RUNTIME_PASSWORD) {
    await admin.unsafe(`ALTER ROLE abh_runtime PASSWORD '${process.env.ABH_RUNTIME_PASSWORD}'`);
    await admin.unsafe(`ALTER ROLE abh_queue PASSWORD '${process.env.ABH_QUEUE_PASSWORD ?? process.env.ABH_RUNTIME_PASSWORD}'`);
  }
  const [check] = await admin`SELECT count(*)::int AS grants FROM control.grants
    WHERE resource_organization_id=${organizationId} AND id=${grantId}`;
  console.log(JSON.stringify({
    provisioned: true, organizationId, principalId, grantId, authorityId, grants: check.grants,
    issuer, subject,
  }));
} finally {
  await admin.end({ timeout: 2 });
}
