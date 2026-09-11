import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';

const root = resolve(import.meta.dirname, '..');
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const groups = await Promise.all(entries.filter(e => !['.git', 'node_modules', 'dist', '.turbo'].includes(e.name)).map(e => {
    const path = resolve(dir, e.name);
    return e.isDirectory() ? files(path) : path.endsWith('.md') ? [path] : [];
  }));
  return groups.flat();
}
let count = 0;
const errors = [];
for (const file of await files(root)) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/\]\(([^\s)]+)\)/g)) {
    const link = match[1];
    if (/^(?:[a-z]+:|#|\/)/i.test(link)) continue;
    const path = resolve(dirname(file), decodeURIComponent(link.split('#')[0]));
    try { await stat(path); count++; }
    catch { errors.push(`${relative(root, file)}: ${link}`); }
  }
}
if (errors.length) throw new Error(`Broken local document links:\n${errors.join('\n')}`);
console.log(`Checked ${count} local document links.`);
