import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

export async function checkPackageApi(packageRoot) {
  const root = resolve(packageRoot);
  const { Extractor, ExtractorConfig } = createRequire(join(root, 'package.json'))('@microsoft/api-extractor');
  const update = process.argv.length === 3 && process.argv[2] === '--update';
  if (process.argv.length > 2 && !update) throw new Error('Usage: check-api.mjs [--update]');
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const reports = join(root, 'api');
  const temporary = await mkdtemp(join(tmpdir(), 'abh-api-'));
  let failed = false;
  try {
    await mkdir(reports, { recursive: true });
    const expected = Object.keys(pkg.exports).map(entry => `${entry === '.' ? 'index' : entry.slice(2)}.api.md`).sort();
    const actual = (await readdir(reports)).filter(name => name.endsWith('.api.md')).sort();
    if (!update && JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('API report entry set differs; run pnpm api:update and review.');
    if (update) for (const obsolete of actual.filter(name => !expected.includes(name))) await rm(join(reports, obsolete));
    for (const [entry, target] of Object.entries(pkg.exports)) {
      const name = entry === '.' ? 'index' : entry.slice(2);
      if (!/^[a-z]+$/.test(name) || typeof target.types !== 'string' || !target.types.startsWith('./dist/src/')) throw new Error(`Unsupported export declaration: ${entry}`);
      await readFile(join(root, target.types)); // A missing build must fail, never use stale source inference.
      const configuration = ExtractorConfig.prepare({
        configObject: {
          projectFolder: root,
          newlineKind: 'lf',
          mainEntryPointFilePath: join(root, target.types),
          compiler: { tsconfigFilePath: join(root, 'tsconfig.json') },
          apiReport: { enabled: true, reportFileName: `${name}.api.md`, reportFolder: reports, reportTempFolder: temporary },
          docModel: { enabled: false }, dtsRollup: { enabled: false }, tsdocMetadata: { enabled: false },
          messages: {
            compilerMessageReporting: { default: { logLevel: 'error' } },
            extractorMessageReporting: { default: { logLevel: 'warning' }, 'ae-missing-release-tag': { logLevel: 'none' }, 'ae-forgotten-export': { logLevel: 'none' }, 'ae-undocumented': { logLevel: 'none' } },
            tsdocMessageReporting: { default: { logLevel: 'none' } },
          },
        },
        configObjectFullPath: join(root, 'api-extractor.json'), packageJsonFullPath: join(root, 'package.json'),
      });
      const result = Extractor.invoke(configuration, { localBuild: update, showVerboseMessages: false, messageCallback(message) {
        if (message.messageId === 'console-preamble' || message.messageId === 'console-compiler-version-notice') message.handled = true;
      } });
      if (!result.succeeded) failed = true;
    }
  } finally { await rm(temporary, { recursive: true, force: true }); }
  if (failed) { console.error('Public API reports differ or contain errors. Run pnpm api:update and review the changes.'); process.exitCode = 1; }
  else console.log(`Public API ${update ? 'reports updated' : 'reports match'} (${Object.keys(pkg.exports).length} entry points).`);

}
