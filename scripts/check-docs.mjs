import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const catalog = JSON.parse(readFileSync(resolve(root, 'scripts/chapters.json'), 'utf8'));
const chapters = catalog.flatMap(p => p.chapters);
const errors = [];
function withoutCode(text) {
  let fence = null;
  return text.split('\n').map(line => {
    const match = line.match(/^\s*(`{3,}|~{3,})/);
    if (match && !fence) { fence = match[1]; return ''; }
    if (match && fence && match[1][0] === fence[0] && match[1].length >= fence.length) { fence = null; return ''; }
    return fence ? '' : line;
  }).join('\n');
}
if (chapters.length !== 42 || chapters.some((c, i) => c.number !== i + 1)) errors.push('Chapter numbering must be 01–42 exactly once');
for (const chapter of chapters) {
  const path = resolve(root, 'docs', chapter.path);
  if (!existsSync(path)) { errors.push(`Missing chapter ${chapter.path}`); continue; }
  const text = withoutCode(readFileSync(path, 'utf8'));
  const headings = [...text.matchAll(/^# (.+)$/gm)].map(m => m[1]);
  if (headings.length !== 1 || headings[0] !== chapter.title) errors.push(`H1 mismatch: ${chapter.path}: ${headings}`);
  if (!/^[a-z0-9/-]+\.md$/.test(chapter.path)) errors.push(`Path casing: ${chapter.path}`);
}
function walk(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap(e => {
    if (['node_modules', '.git', '.vitepress'].includes(e.name)) return [];
    const p = resolve(path, e.name);
    return e.isDirectory() ? walk(p) : extname(p) === '.md' ? [p] : [];
  });
}
for (const path of walk(root)) {
  const text = withoutCode(readFileSync(path, 'utf8'));
  for (const m of text.matchAll(/\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const link = m[1];
    if (/^(https?:|mailto:|#)/.test(link)) continue;
    const target = decodeURIComponent(link.split('#')[0]);
    if (!target) continue;
    const p = target.startsWith('/') ? resolve(root, 'docs', target.slice(1)) : resolve(dirname(path), target);
    if (![p, p + '.md', p + '.html'].some(existsSync)) errors.push(`Missing link in ${path.slice(root.length+1)}: ${link}`);
  }
}
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`PASS: ${chapters.length} chapter titles/order/case, local Markdown target paths. VitePress build checks site links separately.`);
