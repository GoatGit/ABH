const USAGE = `abh mission <command> [options]

Commands:
  list            List missions (requires connection and read grant)
  get <id>        Show mission detail by UUID
  activate <id>   Activate a Draft mission (requires authority)
  pause <id>      Pause an Active mission
  cancel <id>     Cancel a mission
  verify <taskId> Submit verification for a task

Options:
  --url <url>     ABH HTTP base URL (default: http://localhost:3000)
  --token <jwt>   Bearer token (default: ABH_TOKEN env)
  --format <fmt>  Output format: json or table (default: json)
`;

async function api(url, path, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${url.replace(/\/$/, '')}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `HTTP ${response.status}`);
  }
  return data;
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
      const result = await api(url, '/v1/commands/abh.missions.activate', {
        method: 'POST',
        token,
        body: {
          type: 'abh.missions.activate',
          target: { type: 'abh.mission', id: positional[0], version: 1 },
          payload: { missionRef: { type: 'abh.mission', id: positional[0], version: 1 }, authorityRef: { type: 'abh.mission-authority', id: flags.authority, version: 1 } },
        },
      });
      stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    if (command === 'pause' && positional[0]) {
      const result = await api(url, '/v1/commands/abh.missions.pause', {
        method: 'POST',
        token,
        body: {
          type: 'abh.missions.pause',
          target: { type: 'abh.mission', id: positional[0], version: 1 },
          payload: { missionRef: { type: 'abh.mission', id: positional[0], version: 1 }, reasonCode: flags.reason || 'manual.pause' },
        },
      });
      stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    if (command === 'cancel' && positional[0]) {
      const result = await api(url, '/v1/commands/abh.missions.cancel', {
        method: 'POST',
        token,
        body: {
          type: 'abh.missions.cancel',
          target: { type: 'abh.mission', id: positional[0], version: 1 },
          payload: { missionRef: { type: 'abh.mission', id: positional[0], version: 1 }, reasonCode: flags.reason || 'manual.cancel' },
        },
      });
      stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    if (command === 'verify' && positional[0]) {
      const result = await api(url, '/v1/commands/abh.verification.submit', {
        method: 'POST',
        token,
        body: {
          type: 'abh.verification.submit',
          target: { type: 'abh.task', id: positional[0], version: 1 },
          payload: {
            taskRef: { type: 'abh.task', id: positional[0], version: 1 },
            invocationRef: { type: 'abh.invocation', id: flags.invocation, version: 1 },
            resultArtifactRef: { type: 'abh.artifact', id: flags.artifact, version: 1 },
            verdict: flags.verdict || 'Pass',
          },
        },
      });
      stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    stderr.write(`Unknown mission command: ${command}\n${USAGE}`);
    return 2;
  } catch (error) {
    stderr.write(`abh mission: ${error.message}\n`);
    return 6;
  }
}
