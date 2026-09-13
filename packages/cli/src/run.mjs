import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {resolveDevelopmentConfig,requiredEnvironmentReferences} from '@abh/contracts/config';

const USAGE = `abh run [options]

Start an explicitly installed ABH HTTP and tenant runtime service.

Options:
  --config <path>  abh.config.json path (default: ./abh.config.json)
  --port <n>       HTTP port (default: 3000)
  --host <addr>    Bind address (default: 0.0.0.0)
  --help, -h       Show this help

Environment:
  Configured env references are read from the protected process environment.
  The business module must export createAbhServiceInstallation and install real
  identity, governance, mission, queue and drain dependencies. ABH never invents them.
`;

function fail(stderr, message) {
  stderr.write(`abh run: ${message}\n`);
  return 6;
}

export function parseRunOptions(args) {
  const flags = {};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === '--help' || flag === '-h') { flags[flag] = true; continue; }
    if (!['--config', '--host', '--port'].includes(flag)) return { error: 'INVALID_ARGUMENT' };
    const value = args[++index];
    if (value === undefined || value.startsWith('--') || Object.hasOwn(flags, flag)) return { error: 'INVALID_ARGUMENT' };
    flags[flag] = value;
  }
  return { flags };
}

export async function runServer(args, { env, stdout, stderr, signal }, imports = {}) {
  const environment = env ?? {};
  const parsed = parseRunOptions(args);
  if (parsed.error) return fail(stderr, parsed.error);
  if (parsed.flags['--help'] || parsed.flags['-h']) { stdout.write(USAGE); return 0; }
  const configPath = parsed.flags['--config'] ?? './abh.config.json';
  let configRecord;
  try {
    configRecord = JSON.parse(await readFile(configPath, 'utf8'));
  } catch {
    return fail(stderr, 'CONFIG_UNAVAILABLE');
  }
  if (configRecord?.schema !== 'DevelopmentConfig') return fail(stderr, 'INVALID_ARGUMENT');
  const config = resolveDevelopmentConfig(configRecord.value);
  if (!config.success) return fail(stderr, 'INVALID_ARGUMENT');
  const references = requiredEnvironmentReferences(config.data);
  if (!references.success) return fail(stderr, 'INVALID_ARGUMENT');
  const databaseUrl = environment[references.data.find(item => item.path === '/database/runtimeUrlRef')?.name ?? ''];
  const queueUrl = environment[references.data.find(item => item.path === '/database/queueUrlRef')?.name ?? ''];
  if (typeof databaseUrl !== 'string' || databaseUrl.length === 0
    || typeof queueUrl !== 'string' || queueUrl.length === 0) return fail(stderr, 'DEPENDENCY_UNAVAILABLE');

  const host = parsed.flags['--host'] ?? '0.0.0.0', portValue = parsed.flags['--port'] ?? '3000';
  if (!/^[0-9]+$/.test(portValue) || Number(portValue) > 65535) return fail(stderr, 'INVALID_ARGUMENT');
  const listen = { host, port: Number(portValue) };
  const businessPath = resolve(config.data.runtime.businessEntry);
  let module;
  try {
    module = await (imports.business?.() ?? import(businessPath));
  } catch {
    return fail(stderr, 'BUSINESS_MODULE_UNAVAILABLE');
  }
  if (typeof module.createAbhServiceInstallation !== 'function') return fail(stderr, 'BUSINESS_INSTALLER_REQUIRED');
  let installation;
  try {
    installation = await module.createAbhServiceInstallation({
      config: config.data,
      credentials: { runtimeDatabaseUrl: databaseUrl, queueDatabaseUrl: queueUrl },
    });
  } catch {
    return fail(stderr, 'BUSINESS_INSTALLATION_FAILED');
  }
  const identity = installation?.identity, mission = installation?.mission, runtime = installation?.runtime;
  if (!identity?.provider || typeof identity.issuer !== 'string' || typeof identity.audience !== 'string'
    || typeof installation.credentials !== 'function' || !mission || !runtime?.queue
    || typeof runtime.drainRequest !== 'function' || typeof runtime.recordDrain !== 'function')
    return fail(stderr, 'INCOMPLETE_BUSINESS_INSTALLATION');

  try {
    const server = imports.server ? await imports.server() : await import('@abh/core/server');
    const database = await server.Database.connect(databaseUrl);
    const ingress = new server.IdentityIngress(database, identity.provider, {
      issuer: identity.issuer, audience: identity.audience,
    });
    const service = server.assembleAbhService({
      database, identity: ingress, credentials: installation.credentials, mission,
    });
    stdout.write(`abh: starting on ${listen.host}:${listen.port}\n`);
    await server.runHttpService({
      app: service.app,
      database,
      listen,
      loops: runtime.loops ?? [],
      queue: runtime.queue,
      drainRequest: runtime.drainRequest,
      releaseDrainRequest: runtime.releaseDrainRequest,
      recordDrain: runtime.recordDrain,
      ...(runtime.tenant ? { tenant: { database, options: runtime.tenant } } : {}),
      ...(installation.startup ? { startup: installation.startup } : {}),
    }, { signal: signal ?? process, ...imports.signals });
    return 0;
  } catch (error) {
    const code = error?.code === 'DEPENDENCY_UNAVAILABLE' || error?.code === 'DEPENDENCY_TIMEOUT'
      ? error.code : 'DEPENDENCY_UNAVAILABLE';
    return fail(stderr, code);
  }
}
