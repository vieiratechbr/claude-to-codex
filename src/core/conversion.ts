import { createHash, randomUUID } from 'node:crypto';
import type { SourceSnapshot, ConversionOptions, ConversionBundle, Finding, BundleFile } from '../shared/contracts';
import { inventorySource } from './inventory';
import { safeRelativePath, slug } from './paths';
import { adaptSkill, claudeSyntaxMarkers } from './adapters/skills';
import { adaptManifest } from './adapters/manifests';
import { adaptMcp } from './adapters/mcp';
import { adaptHooks } from './adapters/hooks';
import { adaptWithCodex } from './semantic';
import { resolveLayout } from './adapters/layout';
import { preserveReferences } from './references';
import {packageComponent,addPackageEntry} from './skill-packages';
import {applyManualInvocationPolicy} from './skill-policies';
import {preserveSourceContext} from './source-context';
import {prepareWorkflowResources} from './workflow-resources';
import {adaptWorkflowText,type WorkflowPortabilityOptions} from './workflow-portability';
import {generateSpecialistBindings} from './specialist-bindings';
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
  if (available.some(component => ids.includes(component.id) && component.parentPluginId && ids.includes(component.parentPluginId))) throw new Error('Seleção sobreposta: escolha o plugin completo ou suas skills separadamente.');
  const results: ConversionBundle[] = [];
  const selected=available.filter(c=>ids.includes(c.id));
  const targets=options.asPackage&&selected.length>1?[packageComponent(snapshot,selected)]:selected;
  for (const component of targets) {
    if (options.signal?.aborted) throw new Error('Operação cancelada.');
    const id = randomUUID(); const name = slug(component.name); const owner = new URL(snapshot.request.url).pathname.split('/')[1];
    const originPath = [snapshot.request.subdirectory, component.root].filter(Boolean).join('/');
    const identity = createHash('sha256').update(snapshot.request.url + ':' + originPath).digest('hex').slice(0, 8);
    const pluginName = slug(owner + '-' + name).slice(0, 48) + '-' + identity;
    const findings = [...component.findings];
    const files = new Map<string,BundleFile>(); const manualPaths=new Set<string>();
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
    const putSkill=(target:string,text:string,sourcePath:string|undefined,kind:'skill'|'command'|'agent'='skill')=>{
      const adapted=adaptSkill(text,target.split('/').at(-2)!,kind);
      findings.push(...adapted.findings.map(f=>({...f,file:f.file||target})));
      if(adapted.manualOnly)manualPaths.add(target);
      put(target,adapted.text,sourcePath);
    };
    const relative = (path: string) => component.root ? path.slice(component.root.length + 1) : path;
    const sourceFiles = snapshot.files.filter(f => component.files.includes(f.path) && f.mode !== '160000');
    for (const source of snapshot.files.filter(f => component.files.includes(f.path))) if (source.mode === '160000' || source.data.toString('utf8',0,100).startsWith('version https://git-lfs.github.com/spec/v1')) findings.push({ code: 'external-resource', severity: 'blocking', message: 'Recurso externo não baixado: ' + source.path, file: source.path });
    const layout = resolveLayout(component.manifest || {}, sourceFiles, relative); findings.push(...layout.findings);
    const skillFolders=new Map<string,string>();const usedFolders=new Set<string>();
    for(const root of layout.skillRoots){
      const base=slug(root.split('/').at(-1)||name);
      const duplicated=layout.skillRoots.filter(other=>slug(other.split('/').at(-1)||name)===base).length>1;
      let folder=options.asPackage&&duplicated?base.slice(0,48)+'-'+digest(Buffer.from(root)).slice(0,8):base;
      if(options.asPackage){for(let suffix=1;usedFolders.has(folder);suffix++)folder=base.slice(0,48)+'-'+digest(Buffer.from(root)).slice(0,8)+'-'+suffix;}
      usedFolders.add(folder);skillFolders.set(root,folder);
    }
    for (const source of sourceFiles) {
      const rel = relative(source.path);
      if (rel.startsWith('.claude-plugin/') || rel === '.mcp.json' || rel.startsWith('hooks/')) continue;
      if (component.kind === 'skill') {
        if (rel === 'LICENSE' || rel.startsWith('LICENSE.')) put(rel, source.data, source.path);
        if (rel === 'SKILL.md') {
          const target = 'skills/' + name + '/SKILL.md'; putSkill(target,source.data.toString(),source.path);
        } else put('skills/' + name + '/' + rel, source.data, source.path);
      } else {
        const skillRoot = layout.skillRoots.find(root => root ? rel.startsWith(root + '/') : rel === 'SKILL.md');
        if (skillRoot !== undefined) {
          const skillName = skillFolders.get(skillRoot)!; const suffix = skillRoot ? rel.slice(skillRoot.length + 1) : rel;
          if (suffix === 'SKILL.md') {
            const target = 'skills/' + skillName + '/SKILL.md'; putSkill(target,source.data.toString(),source.path);
          } else put('skills/' + skillName + '/' + suffix, source.data, source.path);
        } else put(rel, source.data, source.path);
      }
    }
    if (component.kind === 'plugin') for (const prompt of layout.prompts) {
      const skillName = slug(prompt.kind + '-' + prompt.name); const target = 'skills/' + skillName + '/SKILL.md';
      if (files.has(target)) { findings.push({ code: 'duplicate-component', severity: 'blocking', message: 'Componentes diferentes usam o mesmo nome: ' + skillName }); continue; }
      putSkill(target,prompt.text,prompt.sourcePath,prompt.kind);
    }
    const manifest = adaptManifest(component.manifest || {}, pluginName, owner); findings.push(...manifest.findings);
    const sourceHooksSelected=component.manifest?.hooks !== undefined || sourceFiles.some(f => /(^|\/)hooks\/hooks\.json$/.test(f.path));
    findings.push(...adaptHooks(sourceHooksSelected));
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
    const skills = [...files.keys()].filter(path => /^skills\/[^/]+\/SKILL\.md$/.test(path));
    if (!skills.length && !Object.keys(servers).length) findings.push({ code: 'empty-package', severity: 'blocking', message: 'Nenhuma skill ou integração convertível encontrada.' });
    if (!skills.length) delete manifest.manifest.skills;
    for (const legal of snapshot.files.filter(f => /(^|\/)(?:licen[cs]e|notice|copying|copyright)(?:[._-][^/]+)?$/i.test(f.path))) {
      const parent = legal.path.includes('/') ? legal.path.slice(0,legal.path.lastIndexOf('/')) : '';
      if (!parent || component.root === parent || component.root.startsWith(parent + '/')) {
        if (!files.has(legal.path)) put(legal.path, legal.data, legal.path);
      }
    }
    preserveReferences(snapshot, files, put, findings);
    preserveSourceContext(snapshot,files,put,findings);
    const workflowContexts=new Map<string,WorkflowPortabilityOptions>();
    const semanticPaths=prepareWorkflowResources(snapshot,files,put,findings,workflowContexts);
    const specialists=generateSpecialistBindings({snapshot,files,put,findings,pluginName});
    if(specialists.roles.length){
      const guide='codex-compat/runtime.md',existing=files.get(guide);
      put(guide,(existing?.data.toString()||'# Runtime contract\n\nResolve the installed package from its advertised SKILL.md location and select the actual project separately. Installed resources are read-only; approved project changes belong to the selected project.\n')+'\nBefore specialist delegation, read [the concrete specialist bindings and setup contract](specialists.md). Preserved role frontmatter is not native configuration. Verify target role discovery, preloads, effective tool masks, project memory and any required Git worktree before the dependent phase.\n',undefined,!!existing);
      if(!existing)for(const path of skills){const file=files.get(path)!;put(path,file.data.toString()+'\n\nBefore specialist use, read [the runtime contract](../../codex-compat/runtime.md).\n',undefined,true);}
    }
    const reconcileDynamic=(path:string)=>{
      if(/!`[^`]+`/.test(files.get(path)!.data.toString()))return;
      for(const finding of findings.filter(f=>f.code==='dynamic-command'&&f.file===path)){
        finding.code='dynamic-command-adapted';finding.severity='warning';finding.message='O contexto dinâmico da origem foi adaptado para obtenção explícita durante o uso. Confira o procedimento e suas dependências na revisão.';
      }
    };
    for(const path of skills)reconcileDynamic(path);
    put('.codex-plugin/plugin.json', JSON.stringify(manifest.manifest, null, 2));
    options.onProgress?.({ operationId: id, stage: 'conversion', message: 'Adaptando ' + component.name });
    if (semanticPaths.size) {
      if (options.useCodex) {
        try {
          const members=options.asPackage&&selected.length>1?selected:[component];
          const proposed = await adaptWithCodex({ files: [...semanticPaths].map(path => ({ path, content: files.get(path)!.data.toString() })), findings, supportingFiles: [...files.values()], activeSkillPaths:skills,
            conversionScope:{selectedComponents:members.map(({kind,root,name})=>({kind,root,name})),sourceHooks:{selected:sourceHooksSelected,converted:false},sourceHostSettingsActivated:false},
            validateFile:file=>{
              const workflow=adaptWorkflowText(file.content,workflowContexts.get(file.path)!);
              const markers=claudeSyntaxMarkers(workflow.text);
              return [...workflow.findings.filter(f=>f.severity==='blocking'),...(markers.length?[{code:'source-syntax-remains',severity:'blocking' as const,file:file.path,message:markers.join(', ')}]:[])];
            }
          }, options);
          findings.push(...proposed.findings);
          for (const file of proposed.files) {
            if(!semanticPaths.has(file.path)){
              findings.push({code:'semantic-failed',severity:'blocking',file:file.path,message:'A resposta tentou alterar um recurso não selecionado para adaptação.'});continue;
            }
            const workflow=adaptWorkflowText(file.content,workflowContexts.get(file.path)!);
            if(workflow.semanticNeeded){findings.push(...workflow.findings.filter(f=>f.severity==='blocking'));continue;}
            const adapted=skills.includes(file.path)?adaptSkill(workflow.text,file.path.split('/').at(-2)!):{text:workflow.text,findings:[],semantic:claudeSyntaxMarkers(workflow.text).length>0};
            if(adapted.semantic){findings.push({code:'semantic-failed',severity:'blocking',file:file.path,message:'O documento ainda contém instruções específicas do Claude Code.'});continue;}
            findings.push(...adapted.findings.map(f=>({...f,file:f.file||file.path})));
            put(file.path, adapted.text, undefined, true);
            for(const finding of findings.filter(f=>f.file===file.path&&['workflow-unmapped-source-requirement','workflow-source-api-example','workflow-source-instruction-import','workflow-route-unresolved','workflow-instructions-map-needed','workflow-project-write-review','workflow-installed-resource-write-review'].includes(f.code))){
              finding.code+='-adapted';finding.severity='warning';finding.message='O requisito deste documento foi adaptado com seu contexto pelo Codex. Revise a operação correspondente e os requisitos de runtime.';
            }
            reconcileDynamic(file.path);
          }
        } catch (error) { findings.push({ code: 'semantic-failed', severity: 'blocking', message: (error as Error).message, file:(error as Error).message.match(/skills\/[a-z0-9-]+\/SKILL\.md/)?.[0] }); }
      } else for(const path of semanticPaths) findings.push({ code: 'semantic-needed', severity: 'blocking',file:path, message: 'Instruções dependentes do Claude: habilite a conversão assistida pelo Codex.' });
    }
    preserveReferences(snapshot, files, put, findings, true);
    applyManualInvocationPolicy(manualPaths,files,put,findings);
    generateSpecialistBindings({snapshot,files,put,findings,pluginName});
    const entrySkill=options.asPackage?addPackageEntry(snapshot,files,put,findings,options.packageEntry):undefined;
    const skillIds=available.filter(c=>c.kind==='skill').map(c=>c.id);
    const bundle: ConversionBundle = { id, pluginName, sourceCommit: snapshot.commit, files: [...files.values()], findings, installable: false, source: snapshot.request, componentId: component.id, analysisId: snapshot.id,
      ...(options.asPackage?{asPackage:true,componentIds:ids,groupAll:skillIds.length>0&&skillIds.length===ids.length&&skillIds.every(item=>ids.includes(item)),entrySkill}:{}) };
    findings.push(...validateBundle(bundle)); bundle.installable = !findings.some(f => f.severity === 'blocking'); results.push(bundle);
  }
  return results;
}
