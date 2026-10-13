import { createHash } from 'node:crypto';
import { parse } from 'yaml';
import type { SourceSnapshot, SourceComponent } from '../shared/contracts';
export function markdownMetadata(text: string): { name?: string; description?: string; [key: string]: unknown } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) return {};
  const value: unknown = parse(match[1], { maxAliasCount: 20 });
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Cabeçalho da skill inválido.');
  return value as { name?: string; description?: string; [key: string]: unknown };
}
export function inventorySource(snapshot: SourceSnapshot): SourceComponent[] {
  const items: SourceComponent[] = [];
  const manifests = snapshot.files.filter(f => /(^|\/)\.claude-plugin\/plugin\.json$/.test(f.path));
  for (const file of manifests) {
    const root = file.path.replace(/(^|\/)\.claude-plugin\/plugin\.json$/, '');
    const findings: SourceComponent['findings'] = [];
    let manifest: Record<string,unknown> = {};
    try { const value: unknown = JSON.parse(file.data.toString()); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); manifest = value as Record<string,unknown>; }
    catch { findings.push({ code: 'invalid-manifest', severity: 'blocking', message: 'Manifest do plugin inválido.', file: file.path }); }
    items.push({
      id: createHash('sha256').update('plugin:' + root).digest('hex').slice(0, 24), kind: 'plugin', root,
      name: typeof manifest.name === 'string' ? manifest.name : root.split('/').at(-1) || 'Plugin',
      files: snapshot.files.filter(f => !root || f.path.startsWith(root + '/')).map(f => f.path), manifest, findings
    });
  }
  for (const item of items) item.files = item.files.filter(path => !items.some(other => other !== item && other.root && other.root.startsWith(item.root ? item.root + '/' : '') && path.startsWith(other.root + '/')));
  for (const file of snapshot.files.filter(f => /(^|\/)SKILL\.md$/.test(f.path))) {
    if (items.some(item => !item.root || file.path.startsWith(item.root + '/'))) continue;
    const root = file.path.replace(/(^|\/)SKILL\.md$/, ''); const findings: SourceComponent['findings'] = [];
    let meta: ReturnType<typeof markdownMetadata> = {};
    try { meta = markdownMetadata(file.data.toString()); } catch { findings.push({ code: 'invalid-frontmatter', severity: 'blocking', message: 'Cabeçalho da skill inválido.', file: file.path }); }
    items.push({ id: createHash('sha256').update('skill:' + root).digest('hex').slice(0, 24), kind: 'skill', root,
      name: typeof meta.name === 'string' ? meta.name : root.split('/').at(-1) || 'Skill',
      files: snapshot.files.filter(f => !root || f.path.startsWith(root + '/')).map(f => f.path), findings });
  }
  return items;
}
