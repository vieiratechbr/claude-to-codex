import { createHash } from 'node:crypto';
import { parse } from 'yaml';
import type { SourceSnapshot, SourceComponent } from '../shared/contracts';
import { safeRelativePath } from './paths';
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
  for (const catalog of snapshot.files.filter(f => /(^|\/)\.claude-plugin\/marketplace\.json$/.test(f.path))) {
    const catalogRoot = catalog.path.replace(/(^|\/)\.claude-plugin\/marketplace\.json$/, '');
    try {
      const marketplace = JSON.parse(catalog.data.toString());
      if (!Array.isArray(marketplace.plugins)) throw new Error('Marketplace sem lista de plugins.');
      for (const [index, entry] of marketplace.plugins.entries()) {
        const fallbackRoot = '.marketplace-entry/' + createHash('sha256').update(catalog.path + ':' + index).digest('hex').slice(0, 16);
        const item: SourceComponent = { id: createHash('sha256').update('plugin:' + fallbackRoot).digest('hex').slice(0,24), kind: 'plugin', root: fallbackRoot, name: typeof entry?.name === 'string' ? entry.name : 'Entrada ' + index, files: [], manifest: {}, findings: [] };
        try {
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Entrada de marketplace inválida.');
          if (typeof entry.source !== 'string') {
            item.findings.push({ code: 'external-marketplace-source', severity: 'blocking', message: 'Fonte externa do marketplace exige importação separada: ' + item.name }); items.push(item); continue;
          }
          let source = entry.source.replace(/^\.\//, '').replace(/\/$/, '');
          if (source !== '.' && !entry.source.startsWith('./')) {
            if (typeof marketplace.metadata?.pluginRoot !== 'string') throw new Error('Fonte local deve começar com ./');
            source = marketplace.metadata.pluginRoot.replace(/^\.\//,'').replace(/\/$/,'') + '/' + source;
          }
          const root = source === '.' ? catalogRoot : safeRelativePath((catalogRoot ? catalogRoot + '/' : '') + source);
          const existing = items.find(i => i.kind === 'plugin' && i.root === root);
          const fields = Object.fromEntries(Object.entries(entry).filter(([key]) => !['source','strict','category','tags'].includes(key)));
          const components = ['commands','agents','skills','hooks','outputStyles','themes'];
          if (existing) {
            if (existing.name !== item.name) existing.findings.push({ code: 'marketplace-name-conflict', severity: 'blocking', message: 'Nomes conflitantes para a mesma origem: ' + item.name });
            const extra = components.filter(key => key in fields);
            if (entry.strict === false && extra.length) existing.findings.push({ code: 'marketplace-manifest-conflict', severity: 'blocking', message: 'Entrada strict:false conflita com os componentes do plugin.' });
            else for (const key of extra) {
              const original = existing.manifest![key]; const addition = fields[key];
              existing.manifest![key] = original === undefined ? addition : key === 'hooks' && typeof original === 'object' && typeof addition === 'object' ? { ...(original as object), ...(addition as object) } : [...(Array.isArray(original) ? original : [original]), ...(Array.isArray(addition) ? addition : [addition])];
            }
            for (const key of ['displayName','description','author','homepage','repository','license','keywords']) if (key in fields) existing.manifest![key] = fields[key];
          } else {
            item.root = root; item.id = createHash('sha256').update('plugin:' + root).digest('hex').slice(0,24); item.manifest = fields;
            item.files = snapshot.files.filter(f => !root || f.path.startsWith(root + '/')).map(f => f.path);
            if (!item.files.length) item.findings.push({ code: 'missing-marketplace-source', severity: 'blocking', message: 'Pasta local do marketplace não encontrada: ' + root });
            items.push(item);
          }
        } catch (error) { item.findings.push({ code: 'invalid-marketplace-entry', severity: 'blocking', message: (error as Error).message }); items.push(item); }
      }
    } catch (error) { items.push({ id: createHash('sha256').update(catalog.path).digest('hex').slice(0,24), kind: 'plugin', root: '.marketplace-invalid', name: 'Marketplace inválido', files: [], findings: [{ code: 'invalid-marketplace', severity: 'blocking', message: (error as Error).message }] }); }
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
