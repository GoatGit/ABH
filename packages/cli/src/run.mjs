const USAGE = `abh run [options]

Start the ABH HTTP service (requires PostgreSQL and identity configuration).

Options:
  --port <n>       HTTP port (default: 3000)
  --host <addr>    Bind address (default: 0.0.0.0)
  --db <url>       PostgreSQL connection string (default: DATABASE_URL env)
  --help, -h       Show this help

Environment:
  DATABASE_URL     PostgreSQL connection string
  ABH_PORT         Default HTTP port
`;

export async function runServer(args, { env, stdout, stderr, signal }) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      if (args[i] === '--help' || args[i] === '-h') { flags.help = true; continue; }
      flags[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }

  if (flags.help) {
    stdout.write(USAGE);
    return 0;
  }

  const dbUrl = flags.db || env.DATABASE_URL;
  if (!dbUrl) {
    stderr.write('abh run: DATABASE_URL is required\n');
    return 6;
  }

  const port = parseInt(flags.port || env.ABH_PORT || '3000', 10);
  const host = flags.host || '0.0.0.0';

  try {
    // Dynamic import to avoid loading ESM-only deps when showing help.
    const { runHttpService } = await import('@abh/core/server');
    stdout.write(`abh: starting on ${host}:${port}\n`);
    // The full assembly requires identity and mission installation which are
    // deployment-specific. This is a composition stub that validates connectivity.
    stderr.write('abh run: full service assembly requires identity and mission configuration\n');
    stderr.write('abh run: see docs/V1/10-ABH详细设计/61-CLI-Distribution与运维详细设计.md\n');
    return 1;
  } catch (error) {
    stderr.write(`abh run: ${error.message}\n`);
    return 6;
  }
}
