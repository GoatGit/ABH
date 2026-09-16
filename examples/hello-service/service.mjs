import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import postgres from 'postgres';
import { PgBossDeliveryAdapter } from '@abh/adapter-pg-boss';
import {
  CoreError,
  Database,
  IdentityIngress,
  LocalDrainJournal,
  MissionCursorCodec,
  ProjectionCursorCodec,
} from '@abh/core/server';

/** Reference createAbhServiceInstallation for `abh run`.

 *  Identity: the deployment verifies the Bearer token itself and maps it to a provisioned
 *  identity (`deployment.identity_locations`). This example accepts one configured token
 *  (ABH_SERVICE_TOKEN); replace `identity.provider` with real IdP verification for production.
 *  Authorization: current Grants are read from control.grants on every call and revalidated
 *  inside each Owner transaction by Core; nothing here grants by assertion.
 *  Definitions: CreateMission is accepted only for entries in ./definitions.json.
 *  Authority: ActivateMission resolves provisioned rows in deployment.mission_authorities.

 *  Required environment:
 *    ABH_SERVICE_TOKEN        bearer token accepted by this service (dev only)
 *    ABH_ORGANIZATION_ID      provisioned resource organization (UUID)
 *    ABH_CURSOR_KEY           32-byte hex key for encrypted list cursors
 *    ABH_DRAIN_DIR            existing local directory for drain evidence */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REGISTERED_NAME = /^[a-z][a-z0-9-]*(?:[.][a-z][a-z0-9-]*)+$/;

function stableUuid(seed) {
  const hex = createHash('sha256').update(seed).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function bearerOf(request) {
  const raw = request.headers.authorization;
  return typeof raw === 'string' && /^Bearer [^ ]+$/.test(raw) ? raw.slice('Bearer '.length) : undefined;
}

function headerValue(request, name) {
  const value = request.headers[name];
  return typeof value === 'string' ? value : undefined;
}

export async function createAbhServiceInstallation({ credentials: databaseCredentials }) {
  const organizationId = process.env.ABH_ORGANIZATION_ID;
  const token = process.env.ABH_SERVICE_TOKEN;
  const cursorKeyHex = process.env.ABH_CURSOR_KEY;
  const drainDirectory = process.env.ABH_DRAIN_DIR;
  if (!organizationId || !UUID.test(organizationId)) throw new TypeError('ABH_ORGANIZATION_ID must be a provisioned organization UUID');
  if (!token || token.length < 16) throw new TypeError('ABH_SERVICE_TOKEN must be set (minimum 16 chars)');
  if (!cursorKeyHex || !/^[0-9a-f]{64}$/i.test(cursorKeyHex)) throw new TypeError('ABH_CURSOR_KEY must be 64 hex chars (32 bytes)');
  if (!drainDirectory) throw new TypeError('ABH_DRAIN_DIR must point at an existing local directory');
  if (!databaseCredentials?.runtimeDatabaseUrl || !databaseCredentials?.queueDatabaseUrl) throw new TypeError('database role URLs required');
  const issuer = 'urn:abh:hello-service', audience = 'abh-hello-service';
  const subject = 'hello-operator';
  const credentialId = stableUuid(`credential/${token}`);
  const cursorKey = Buffer.from(cursorKeyHex, 'hex');

  const definitions = JSON.parse(await readFile(join(import.meta.dirname, 'definitions.json'), 'utf8'));

  // ---- Identity: replace this provider with real IdP verification for production. ----
  const provider = {
    async verify(request) {
      if (request.issuer !== issuer || request.audience !== audience) return { status: 'Rejected' };
      const presented = request.credentialRef?.id;
      if (presented !== credentialId) return { status: 'Rejected' };
      return {
        status: 'Completed',
        data: {
          issuer, audience, subject, identityKind: 'Human',
          authnStrength: { level: 'SingleFactor' },
          credentialEpoch: 1,
          verifiedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
          evidenceRef: { type: 'abh.identity-evidence', id: stableUuid(`evidence/${credentialId}`), version: 1 },
        },
      };
    },
  };

  // ---- Trusted credential resolution for every HTTP call; ingress revalidates org/purpose. ----
  async function credentials(request) {
    const bearer = bearerOf(request);
    if (!bearer || bearer.length !== token.length
      || !timingSafeEqual(Buffer.from(bearer), Buffer.from(token))) throw new CoreError('UNAUTHENTICATED');
    const organization = headerValue(request, 'x-abh-organization');
    const purpose = headerValue(request, 'x-abh-purpose');
    if (!organization || !UUID.test(organization)) throw new CoreError('INVALID_ARGUMENT');
    if (!purpose || !REGISTERED_NAME.test(purpose)) throw new CoreError('INVALID_ARGUMENT');
    return {
      credentialRef: { type: 'abh.credential', id: credentialId, version: 1 },
      organizationId: organization,
      purpose,
    };
  }

  // ---- Current grants from the database; Core revalidates them in every transaction.
  // Tenant rows are RLS-protected, so resolution runs through the attached Database and
  // its restricted connection admission, never a separate pool. ----
  let database;
  async function currentGrants(context, actionType, options) {
    return database.transaction(context, options, async tx => {
      const tenant = tx.context.tenant;
      const rows = await tx.owner('Control')`
        SELECT id, record->'grantRef'->>'version' AS version FROM control.grants
        WHERE resource_organization_id = ${tenant.resourceOrganizationId}
          AND principal_id = ${tenant.actor.id}
          AND status = 'Active'
          AND valid_from <= now() AND valid_until > now()
          AND record->'actionTypes' ? ${actionType}
          AND record->'purposeNames' ? ${tenant.purposeOfUse}
        LIMIT 101`;
      return rows.map(row => ({ type: 'abh.grant', id: row.id, version: Number(row.version) || 1 }));
    });
  }

  const missionCursor = new MissionCursorCodec(cursorKey);
  const projectionCursor = new ProjectionCursorCodec(cursorKey);

  const mission = {
    grants: async (context, command, options) => currentGrants(context, command.type, options),
    fenceRefs: async () => [],
    definition: {
      async definition(tx, input, goal) {
        process.stderr.write(`DBG def entered: workflow=${input.workflowRef.id} digest=${input.workflowRef.digest} goalDigest=${goal.contentDigest}\n`);
        const workflow = definitions.workflows.find(entry => entry.id === input.workflowRef.id);
        if (!workflow || !workflow.versions.includes(input.workflowRef.version)) throw new Error('workflow not registered');
        if (input.workflowRef.digest !== goal.contentDigest) throw new Error('workflow digest does not bind the goal artifact');
        // 条件引用的 id 是部署登记的确定性 UUID（EntityRef 契约要求 UUID）；
        // 注册表同时接受登记名与派生 UUID，保证名称制与 UUID 制部署均可校验。
        const conditionIds = [
          ...definitions.predicates, ...definitions.triggerPolicies, ...definitions.resourceEnvelopes,
          ...definitions.conditionUuids.predicates, ...definitions.conditionUuids.triggerPolicies, ...definitions.conditionUuids.resourceEnvelopes,
        ];
        for (const ref of [input.conditions.successConditionRef, input.conditions.stopConditionRef, input.conditions.triggerPolicyRef, input.conditions.resourceEnvelopeRef]) {
          if (!conditionIds.includes(ref.id)) throw new Error(`condition not registered: ${ref.id}`);
        }
        for (const scope of input.responsibilityScopeRefs) {
          if (!definitions.responsibilityScopeTypes.includes(scope.type)) throw new Error('responsibility scope not registered');
        }
      },
    },
    activation: {
      // Resolve a current MissionAuthority from the deployment registry.
      // The registry lives beside the definitions so a governance review updates both together.
      async authority(tx, authorityRef) {
        if (authorityRef.type !== 'abh.mission-authority' || !UUID.test(authorityRef.id)
          || !definitions.missionAuthorities.includes(authorityRef.id)) throw new Error('MISSION_AUTHORITY_MISSING');
      },
    },
    // Tool invocation is not offered by this deployment; the ports fail closed and only
    // satisfy the composition-time installation requirement.
    tool: {
      adapter: { call: async () => ({ status: 'Failed', errorDigest: 'sha256:' + '0'.repeat(64) }) },
      outputValidator: async () => { throw new Error('TOOL_OUTPUT_STORAGE_DISABLED'); },
      resultStorage: {
        dataClass: 'abh.data.internal',
        region: 'local',
        retentionPolicyRef: { type: 'abh.retention-policy', id: stableUuid('retention/disabled'), version: 1 },
      },
    },
    list: {
      cursor: missionCursor,
      grants: async (context, _filter, options) => currentGrants(context, 'abh.missions.read', options),
    },
    projectionList: {
      cursor: projectionCursor,
      grants: async (context, _filter, options) => currentGrants(context, 'abh.missions.read', options),
    },
  };

  // ---- Durable queue + persisted drain evidence. ----
  const queue = await PgBossDeliveryAdapter.start({
    connectionString: databaseCredentials.queueDatabaseUrl,
    admission: { resolve: async () => ({ resourceOrganizationId: organizationId, consumerId: 'hello.service' }) },
    onError: () => { process.stderr.write('abh: queue dependency reported an error\n'); },
  });
  const drainJournal = new LocalDrainJournal({
    directory: drainDirectory, resourceOrganizationId: organizationId,
    instanceId: stableUuid(`instance/${databaseCredentials.runtimeDatabaseUrl}`),
  });
  const runtime = {
    queue,
    drainRequest: async () => ({
      context: {
        callId: randomUUID(),
        requestContextRef: { type: 'abh.request-context', id: stableUuid('drain-request-context'), version: 1 },
        target: {
          objectRef: { type: 'abh.organization', id: organizationId, version: 1 },
          scopeRefs: [{ type: 'abh.organization', id: organizationId, version: 1 }],
          action: 'abh.runtime.drain',
        },
        deadline: new Date(Date.now() + 10_000).toISOString(),
      },
      queueClasses: ['control', 'reconcile', 'background'],
    }),
    recordDrain: async report => { await drainJournal.save(report); },
  };

  const startup = {
    timeoutMs: 30_000,
    checks: [{
      name: 'database',
      verify: async options => database.verify(options),
    }],
  };

  // Optional capability surfaces. The reference deployment mounts inline goal-artifact
  // storage (CreateMission requires a goal artifact) and the pack capability query with
  // deployment-policy admission; a production deployment replaces these with its own
  // governed policy implementation.
  const organizationScope = { type: 'abh.organization', id: organizationId, version: 1 };
  const artifactStorage = {
    grants: async (context, command, options) => currentGrants(context, command.type, options),
    checks: {
      fenceRefs: async () => [organizationScope],
      admit: async (_tx, payload) => {
        process.stderr.write(`DBG admit payload=${JSON.stringify(payload)} org=${organizationId}\n`);
        if (payload.ownerRef?.type !== 'abh.organization' || payload.ownerRef?.id !== organizationId) {
          throw new Error('artifact owner must be the deployment organization');
        }
        if (payload.dataClass !== 'abh.data.internal') throw new Error('unsupported data class');
        if (payload.region !== 'local') throw new Error('unsupported region');
        if (payload.retentionPolicyRef?.type !== 'abh.organization' || payload.retentionPolicyRef?.id !== organizationId) {
          throw new Error('retention policy must reference the deployment organization');
        }
        for (const purpose of payload.purposeNames) {
          // goal artifact 为 Mission 创建的受限输入存储：mission.manage（业务）与
          // action.prepare（store-inline 协议要求的执行准备用途）均为合法用途。
          if (!['abh.mission.manage', 'abh.action.prepare'].includes(purpose)) {
            throw new Error(`purpose not allowed: ${purpose}`);
          }
        }
      },
      references: async (_tx, refs) => {
        for (const ref of refs) {
          if (ref?.type === 'abh.organization' && ref.id !== organizationId) {
            throw new Error('cross-organization artifact references are not allowed');
          }
        }
      },
    },
  };
  const capabilityQuery = {
    grants: async (context, _query, options) => currentGrants(context, 'abh.capabilities.query', options),
    admission: {
      fenceRefs: async () => [],
      // No packs are registered in the reference deployment; inspect is unreachable
      // until a pack is staged and enabled by the deployment's governance.
      inspect: async () => { throw new Error('pack capability inspection is not configured in the reference deployment'); },
    },
  };

  return {
    identity: { provider, issuer, audience },
    credentials,
    mission,
    runtime,
    startup,
    artifactStorage,
    capabilityQuery,
    attach: async attached => { database = attached.database; },
    async close() {
      await queue.close();
    },
  };
}
