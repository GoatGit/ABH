import { randomUUID } from 'node:crypto';

const USAGE = `abh mission <command> [options]

Commands:
  list                       List missions (requires connection and read grant)
  get <id>                   Show mission detail by UUID
  activate <id> --authority <uuid> [--authority-version <n>]
                             Activate a Draft mission (Update; reads current version, sends If-Match)
  pause <id> [--reason <name>]     Pause an Active mission (default reason: manual.pause)
  cancel <id> [--reason <name>]    Cancel a mission (default reason: manual.cancel)
  verify <taskId> --invocation <uuid> --artifact <uuid>
        [--verdict Pass|Reject|NeedsResponsibility|Inconclusive]
        [--task-version <n>] [--invocation-version <n>] [--artifact-version <n>]
                             Submit verification for a task (Create; idempotent)

Options:
  --url <url>     ABH HTTP base URL (default: http://localhost:3000)
  --token <jwt>   Bearer token (default: ABH_TOKEN env)
  --format <fmt>  Output format: json or table (default: json)

Command contract: every POST sends an Idempotency-Key; Update-mode commands read the
current version first and send If-Match, so retried commands never double-apply.
`;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REASON_PATTERN = /^[a-z][a-z0-9-]*(?:[.][a-z][a-z0-9-]*)+$/;
const VERDICTS = new Set(['Pass', 'Reject', 'NeedsResponsibility', 'Inconclusive']);
const VERSION_PATTERN = /^[1-9][0-9]*$/;

async function api(url, path, { token, method = 'GET', body, headers } = {}) {
  const response = await fetch(`${url.replace(/\/$/, '')}${path}`, {
    method,
    headers: {
      'Accept': 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers ?? {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = typeof data.code === 'string' ? data.code : `HTTP_${response.status}`;
    throw new Error(data.message ? `${code}: ${data.message}` : code);
  }
  return data;
}

/** Reads the current mission version so Update commands can send a valid If-Match. */
async function currentMissionVersion(url, token, id) {
  const view = await api(url, `/v1/queries/abh.missions.get?id=${id}`, { token });
  const version = view?.mission?.missionRef?.version;
  if (!VERSION_PATTERN.test(String(version))) throw new Error('Mission view did not include a usable missionRef.version');
  return Number(version);
}

function post(url, path, { token, idempotencyKey, ifMatchVersion, target, payload }) {
  return api(url, path, {
    method: 'POST',
    token,
    headers: {
      'Idempotency-Key': idempotencyKey,
      ...(ifMatchVersion !== undefined ? { 'If-Match': `"${ifMatchVersion}"` } : {}),
    },
    body: { target, payload },
  });
}

function requireUuid(flags, name) {
  const value = flags[name];
  if (!value || !UUID_PATTERN.test(value)) {
    throw Object.assign(new Error(`--${name} must be a UUID`), { usage: true });
  }
  return value;
}

function optionalVersion(flags, name) {
  const value = flags[name] === undefined ? '1' : String(flags[name]);
  if (!VERSION_PATTERN.test(value)) {
    throw Object.assign(new Error(`--${name} must be a positive integer`), { usage: true });
  }
  return Number(value);
}

function reason(flags, fallback) {
  const value = flags.reason === undefined ? fallback : String(flags.reason);
  if (!REASON_PATTERN.test(value)) {
    throw Object.assign(new Error('--reason must match a registered name such as manual.pause'), { usage: true });
  }
  return value;
}

function verdict(flags) {
  const value = flags.verdict === undefined ? 'Pass' : String(flags.verdict);
  if (!VERDICTS.has(value)) {
    throw Object.assign(new Error('--verdict must be one of Pass, Reject, NeedsResponsibility, Inconclusive'), { usage: true });
  }
  return value;
}

export async function runMission(args, { env, stdout, stderr }) {
  const [command, ...rest] = args;
  const flags = {};
  const positional = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith('--')) {
      flags[rest[i].slice(2)] = rest[i + 1];
      i++;
    } else {
      positional.push(rest[i]);
    }
  }
  const url = flags.url || env.ABH_URL || 'http://localhost:3000';
  const token = flags.token || env.ABH_TOKEN;
  const format = flags.format || 'json';

  if (!command || command === '--help' || command === '-h') {
    stdout.write(USAGE);
    return 0;
  }

  try {
    if (command === 'list') {
      const result = await api(url, '/v1/queries/abh.missions.list?limit=25', { token });
      if (format === 'json') {
        stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      } else {
        for (const mission of result.missions ?? []) {
          stdout.write(`${mission.missionRef.id}  ${mission.status}  ${mission.domainType}\n`);
        }
      }
      return 0;
    }

    if (command === 'get' && positional[0]) {
      const result = await api(url, `/v1/queries/abh.missions.get?id=${positional[0]}`, { token });
      stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    if (command === 'activate' && positional[0]) {
      const id = positional[0];
      const authority = requireUuid(flags, 'authority');
      const version = await currentMissionVersion(url, token, id);
      const result = await post(url, '/v1/commands/abh.missions.activate', {
        token,
        idempotencyKey: randomUUID(),
        ifMatchVersion: version,
        target: { type: 'abh.mission', id },
        payload: {
          missionRef: { type: 'abh.mission', id, version },
          authorityRef: { type: 'abh.mission-authority', id: authority, version: optionalVersion(flags, 'authority-version') },
        },
      });
      stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    if (command === 'pause' && positional[0]) {
      const id = positional[0];
      const version = await currentMissionVersion(url, token, id);
      const result = await post(url, '/v1/commands/abh.missions.pause', {
        token,
        idempotencyKey: randomUUID(),
        ifMatchVersion: version,
        target: { type: 'abh.mission', id },
        payload: { missionRef: { type: 'abh.mission', id, version }, reasonCode: reason(flags, 'manual.pause') },
      });
      stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    if (command === 'cancel' && positional[0]) {
      const id = positional[0];
      const version = await currentMissionVersion(url, token, id);
      const result = await post(url, '/v1/commands/abh.missions.cancel', {
        token,
        idempotencyKey: randomUUID(),
        ifMatchVersion: version,
        target: { type: 'abh.mission', id },
        payload: { missionRef: { type: 'abh.mission', id, version }, reasonCode: reason(flags, 'manual.cancel') },
      });
      stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    if (command === 'verify' && positional[0]) {
      const taskId = positional[0];
      const result = await post(url, '/v1/commands/abh.verification.submit', {
        token,
        idempotencyKey: randomUUID(),
        target: { type: 'abh.task', id: taskId },
        payload: {
          taskRef: { type: 'abh.task', id: taskId, version: optionalVersion(flags, 'task-version') },
          invocationRef: { type: 'abh.invocation', id: requireUuid(flags, 'invocation'), version: optionalVersion(flags, 'invocation-version') },
          resultArtifactRef: { type: 'abh.artifact', id: requireUuid(flags, 'artifact'), version: optionalVersion(flags, 'artifact-version') },
          verdict: verdict(flags),
        },
      });
      stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    stderr.write(`Unknown mission command: ${command}\n${USAGE}`);
    return 2;
  } catch (error) {
    if (error?.usage) {
      stderr.write(`abh mission: ${error.message}\n${USAGE}`);
      return 2;
    }
    stderr.write(`abh mission: ${error.message}\n`);
    return 6;
  }
}
