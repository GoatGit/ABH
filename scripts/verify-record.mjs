import { glob, readFile, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const REQUIRED = ['date', 'commit', 'scope', 'summary', 'commands', 'results', 'finalCheck'];
const SHA = /^[0-9a-f]{40}$/;

const usage = `usage:
  node scripts/verify-record.mjs --check
      validate every docs/development/verification-*.json: required fields and a
      bound commit SHA (40-hex; legacy "unknown" is accepted for records that
      pre-date SHA binding)
  node scripts/verify-record.mjs stamp <file.json>
      bind <file> to the current git HEAD; run this when the record is written,
      before committing it (the record's own commit will be its successor)`;

const mode = process.argv[2];
if (mode === '--check') {
  let checked = 0;
  const errors = [];
  for await (const file of glob('docs/development/verification-*.json', { cwd: root })) {
    checked++;
    const path = resolve(root, file);
    let record;
    try { record = JSON.parse(await readFile(path, 'utf8')); }
    catch (error) { errors.push(`${file}: invalid JSON (${error.message})`); continue; }
    // Bodies evolved across eras; the universal contract is a date, a bound commit
    // and at least one evidence field.
    for (const field of ['date', 'commit']) {
      if (!(field in record)) errors.push(`${file}: missing "${field}"`);
    }
    const evidence = ['results', 'finalCheck', 'checks', 'logs'].some(field => field in record);
    if (!evidence) errors.push(`${file}: missing an evidence field (results/finalCheck/checks/logs)`);
    if (!SHA.test(record.commit ?? '')) {
      errors.push(`${file}: "commit" must be a bound 40-hex SHA (found ${JSON.stringify(record.commit ?? null)}); stamp with verify-record.mjs`);
    }
  }
  if (errors.length || checked === 0) {
    throw new Error(`verification records invalid (${checked} files):\n${errors.join('\n') || 'no records found'}`);
  }
  console.log(`Verified ${checked} verification records (commit SHA bound).`);
  process.exit(0);
}

if (mode === 'stamp') {
  const file = resolve(root, process.argv[3] ?? '');
  const record = JSON.parse(await readFile(file, 'utf8'));
  const head = execSync('git rev-parse HEAD', { cwd: root }).toString().trim();
  if (!SHA.test(head)) throw new Error('git HEAD is not a 40-hex SHA');
  record.commit = head;
  await writeFilePreservingOrder(file, record);
  console.log(`Bound ${process.argv[3]} to ${head}`);
  process.exit(0);
}

console.error(usage);
process.exit(1);

async function writeFilePreservingOrder(file, record) {
  const ordered = {};
  for (const key of ['date', 'commit', ...Object.keys(record).filter(key => key !== 'date' && key !== 'commit')]) {
    if (key in record) ordered[key] = record[key];
  }
  await writeFile(file, `${JSON.stringify(ordered, null, 2)}\n`, 'utf8');
}
