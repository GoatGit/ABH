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

/** GitHub-style heading slugs, including the -1/-2 suffixes that dedupe repeats. */
function slugger() {
  const used = new Map();
  const anchors = new Set();
  return {
    add(heading) {
      const base = heading.toLowerCase()
        .replace(/[^\p{L}\p{N}\p{M}_\s-]/gu, '')
        .trim().replace(/\s/g, '-');
      const index = used.get(base) ?? 0;
      used.set(base, index + 1);
      anchors.add(index === 0 ? base : `${base}-${index}`);
    },
    anchors,
  };
}

/** ATX headings outside fenced code blocks; inline code, emphasis and links contribute text only. */
function headings(source) {
  const found = [];
  let fenced = false;
  for (const line of source.split('\n')) {
    if (/^\s*(?:```|~~~)/.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    const heading = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      const text = heading[1]
        .replace(/`([^`]*)`/g, '$1')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/[*_~]/g, '');
      found.push(text);
    }
  }
  return found;
}

const anchorCache = new Map();
async function anchorsOf(file) {
  let anchors = anchorCache.get(file);
  if (!anchors) {
    anchors = slugger();
    for (const heading of headings(await readFile(file, 'utf8'))) anchors.add(heading);
    anchorCache.set(file, anchors);
  }
  return anchors;
}

let count = 0;
const errors = [];
for (const file of await files(root)) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/\]\(([^\s)]+)\)/g)) {
    const link = match[1];
    if (/^(?:[a-z]+:|\/)/i.test(link)) continue;
    const [pathPart, anchorPart] = link.split('#');
    const target = pathPart ? resolve(dirname(file), decodeURIComponent(pathPart)) : file;
    let stat_ = null;
    try { stat_ = await stat(target); } catch {}
    if (!stat_) { errors.push(`${relative(root, file)}: ${link} (missing file)`); continue; }
    count++;
    if (anchorPart) {
      // Anchors are verifiable in markdown targets only; other sources are counted as file links.
      if (!target.endsWith('.md')) continue;
      const anchors = await anchorsOf(target);
      if (!anchors.anchors.has(decodeURIComponent(anchorPart))) {
        errors.push(`${relative(root, file)}: ${link} (missing anchor)`);
      }
    }
  }
}
if (errors.length) throw new Error(`Broken local document links or anchors:\n${errors.join('\n')}`);
console.log(`Checked ${count} local document links (headings verified where the target is markdown).`);
