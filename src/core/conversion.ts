import { createHash, randomUUID } from 'node:crypto';
import type { SourceSnapshot, ConversionOptions, ConversionBundle, Finding, BundleFile } from '../shared/contracts';
import { inventorySource } from './inventory';
import { safeRelativePath, slug } from './paths';
import { adaptSkill } from './adapters/skills';
import { adaptManifest } from './adapters/manifests';
import { adaptMcp } from './adapters/mcp';
import { adaptHooks } from './adapters/hooks';
import { adaptWithCodex } from './semantic';
import { resolveLayout } from './adapters/layout';
import { preserveReferences } from './references';
export function digest(data: Buffer): string { return createHash('sha256').update(data).digest('hex'); }
export function validateBundle(bundle: ConversionBundle): Finding[] {
  const findings: Finding[] = []; const seen = new Set<string>();
  for (const file of bundle.files) {
    try {
      safeRelativePath(file.path); const key = file.path.normalize('NFC').toLowerCase();
      if (seen.has(key)) throw new Error('Colisão de arquivos: ' + file.path); seen.add(key);
      if (file.sha256 !== digest(file.data)) throw new Error('Hash inválido: ' + file.path);
      if (file.data.length > 2 * 1024 * 1024) throw new Error('Arquivo excede o limite: ' + file.path);
    } catch (error) { findings.push({ code: 'invalid-bundle', severity: 'blocking', message: (error as Error).message, file: file.path }); }
  }
  return findings;
}
export async function convertComponents(snapshot: SourceSnapshot, ids: string[], options: ConversionOptions): Promise<ConversionBundle[]> {
  const available = inventorySource(snapshot);
  if (!ids.length || new Set(ids).size !== ids.length || ids.some(id => !available.some(c => c.id === id))) throw new Error('Selecione componentes encontrados nesta análise.');
  const results: ConversionBundle[] = [];
  for (const component of available.filter(c => ids.includes(c.id))) {
    if (options.signal?.aborted) throw new Error('Operação cancelada.');
    const id = randomUUID(); const name = slug(component.name); const owner = new URL(snapshot.request.url).pathname.split('/')[1];
    const identity = createHash('sha256').update(snapshot.request.url + ':' + component.root).digest('hex').slice(0, 8);
    const pluginName = slug(owner + '-' + name).slice(0, 48) + '-' + identity;
    const findings = [...component.findings];
    const files = new Map<string,BundleFile>(); let semantic = false;
    const put = (path: string, data: Buffer|string, sourcePath?: string, replace = false) => {
      safeRelativePath(path); const bytes = typeof data === 'string' ? Buffer.from(data) : data;
      const key = path.normalize('NFC').toLowerCase(); const previous = [...files.values()].find(f => f.path.normalize('NFC').toLowerCase() === key);
      if (previous && !replace) {
        if (previous.sourcePath === sourcePath && previous.data.equals(bytes)) return;
        findings.push({ code: 'duplicate-destination', severity: 'blocking', message: 'Duas origens usam o destino: ' + path, file: path }); return;
      }
      if (previous && replace && previous.path !== path) throw new Error('Substituição de caminho ambígua.');
      files.set(path, { path, data: bytes, sha256: digest(bytes), sourcePath: sourcePath || previous?.sourcePath });
    };
    const relative = (path: string) => component.root ? path.slice(component.root.length + 1) : path;
    const sourceFiles = snapshot.files.filter(f => component.files.includes(f.path) && f.mode !== '160000');
    for (const source of snapshot.files.filter(f => component.files.includes(f.path))) if (source.mode === '160000' || source.data.toString('utf8',0,100).startsWith('version https://git-lfs.github.com/spec/v1')) findings.push({ code: 'external-resource', severity: 'blocking', message: 'Recurso externo não baixado: ' + source.path, file: source.path });
    const layout = resolveLayout(component.manifest || {}, sourceFiles, relative); findings.push(...layout.findings);
    for (const source of sourceFiles) {
      const rel = relative(source.path);
      if (rel.startsWith('.claude-plugin/') || rel === '.mcp.json' || rel.startsWith('hooks/')) continue;
      if (component.kind === 'skill') {
        if (rel === 'LICENSE' || rel.startsWith('LICENSE.')) put(rel, source.data, source.path);
        if (rel === 'SKILL.md') {
          const adapted = adaptSkill(source.data.toString(), name); findings.push(...adapted.findings); semantic ||= adapted.semantic; put('skills/' + name + '/SKILL.md', adapted.text, source.path);
        } else put('skills/' + name + '/' + rel, source.data, source.path);
      } else {
        const skillRoot = layout.skillRoots.find(root => root ? rel.startsWith(root + '/') : rel === 'SKILL.md');
        if (skillRoot !== undefined) {
          const skillName = slug(skillRoot.split('/').at(-1) || name); const suffix = skillRoot ? rel.slice(skillRoot.length + 1) : rel;
          if (suffix === 'SKILL.md') {
            const adapted = adaptSkill(source.data.toString(), skillName); findings.push(...adapted.findings); semantic ||= adapted.semantic; put('skills/' + skillName + '/SKILL.md', adapted.text, source.path);
          } else put('skills/' + skillName + '/' + suffix, source.data, source.path);
        } else put(rel, source.data, source.path);
      }
    }
    if (component.kind === 'plugin') for (const prompt of layout.prompts) {
      const skillName = slug(prompt.kind + '-' + prompt.name); const target = 'skills/' + skillName + '/SKILL.md';
      if (files.has(target)) { findings.push({ code: 'duplicate-component', severity: 'blocking', message: 'Componentes diferentes usam o mesmo nome: ' + skillName }); continue; }
      const adapted = adaptSkill(prompt.text, skillName, prompt.kind); findings.push(...adapted.findings); semantic ||= adapted.semantic; put(target, adapted.text, prompt.sourcePath);
    }
    const manifest = adaptManifest(component.manifest || {}, pluginName, owner); findings.push(...manifest.findings);
    findings.push(...adaptHooks(component.manifest?.hooks !== undefined || sourceFiles.some(f => /(^|\/)hooks\/hooks\.json$/.test(f.path))));
    const mcpInputs: unknown[] = [];
    const defaultMcp = sourceFiles.find(f => relative(f.path) === '.mcp.json');
    if (defaultMcp) { try { mcpInputs.push(JSON.parse(defaultMcp.data.toString())); } catch { findings.push({ code: 'invalid-mcp', severity: 'blocking', message: 'JSON MCP inválido.' }); } }
    const loadMcp = (value: unknown): void => {
      if (Array.isArray(value)) { value.forEach(loadMcp); return; }
      if (typeof value === 'string') {
        try {
          const path = safeRelativePath(value.replace(/^\.\//, '')); const file = sourceFiles.find(f => relative(f.path) === path);
          if (!file) throw new Error('Arquivo MCP ausente: ' + path); mcpInputs.push(JSON.parse(file.data.toString()));
        } catch (error) { findings.push({ code: 'invalid-mcp', severity: 'blocking', message: (error as Error).message }); }
      } else if (value) mcpInputs.push(value);
    };
    loadMcp(component.manifest?.mcpServers);
    let servers: Record<string,unknown> = {};
    for (const mcp of mcpInputs) {
      try { const adapted = adaptMcp(mcp); servers = { ...servers, ...adapted.servers }; findings.push(...adapted.findings); }
      catch (error) { findings.push({ code: 'invalid-mcp', severity: 'blocking', message: (error as Error).message }); }
    }
    if (Object.keys(servers).length) { put('.mcp.json', JSON.stringify({ mcpServers: servers }, null, 2)); manifest.manifest.mcpServers = './.mcp.json'; }
    const skills = [...files.keys()].filter(path => /^skills\/.+\/SKILL\.md$/.test(path));
    if (!skills.length && !Object.keys(servers).length) findings.push({ code: 'empty-package', severity: 'blocking', message: 'Nenhuma skill ou integração convertível encontrada.' });
    if (!skills.length) delete manifest.manifest.skills;
    for (const legal of snapshot.files.filter(f => /(^|\/)(?:licen[cs]e|notice|copying|copyright)(?:[._-][^/]+)?$/i.test(f.path))) {
      const parent = legal.path.includes('/') ? legal.path.slice(0,legal.path.lastIndexOf('/')) : '';
      if (!parent || component.root === parent || component.root.startsWith(parent + '/')) {
        if (!files.has(legal.path)) put(legal.path, legal.data, legal.path);
      }
    }
    preserveReferences(snapshot, files, put, findings);
    put('.codex-plugin/plugin.json', JSON.stringify(manifest.manifest, null, 2));
    options.onProgress?.({ operationId: id, stage: 'conversion', message: 'Adaptando ' + component.name });
    if (semantic) {
      if (options.useCodex) {
        try {
          const proposed = await adaptWithCodex({ files: skills.map(path => ({ path, content: files.get(path)!.data.toString() })), findings }, options);
          for (const file of proposed.files) { const adapted = adaptSkill(file.content, file.path.split('/').at(-2)!); if (adapted.semantic) throw new Error('A resposta ainda depende de recursos do Claude Code.'); findings.push(...adapted.findings); put(file.path, adapted.text, undefined, true); }
          findings.push(...proposed.findings);
        } catch (error) { findings.push({ code: 'semantic-failed', severity: 'blocking', message: (error as Error).message }); }
      } else findings.push({ code: 'semantic-needed', severity: 'blocking', message: 'Instruções dependentes do Claude: habilite a conversão assistida pelo Codex.' });
    }
    preserveReferences(snapshot, files, put, findings, true);
    const bundle: ConversionBundle = { id, pluginName, sourceCommit: snapshot.commit, files: [...files.values()], findings, installable: false, source: snapshot.request, componentId: component.id, analysisId: snapshot.id };
    findings.push(...validateBundle(bundle)); bundle.installable = !findings.some(f => f.severity === 'blocking'); results.push(bundle);
  }
  return results;
}
