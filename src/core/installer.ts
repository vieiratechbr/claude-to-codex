import { randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { mkdir, open, unlink, readFile, lstat } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import type { ConversionBundle, InstallResult } from '../shared/contracts';
import { OperationStore, atomicWrite, type OperationRecord } from './store';
import { validateBundle } from './conversion';
import { assertOwnedPath, safeJoin } from './paths';
import { checkedProcess } from './process';
import { snapshotFile, restoreFile } from './recovery';
import { provenance } from './provenance';
import { verifyBundleFiles, findPython } from './verification';
import type { InstallationVerification, VerificationCheck } from '../shared/verification';
import {markdownMetadata} from './inventory';
export const MARKETPLACE = 'claude-to-codex-local';
export interface InstallerContext { dataRoot: string; codexPath: string; codexHome?: string; signal?: AbortSignal; run?: (args: string[]) => Promise<any> }
interface StateSnapshot { config: string|null; catalog: string|null }
interface Transaction {
  action: 'install'|'update'|'remove'; pluginName: string; installationId: string; bundleId?: string;
  before: StateSnapshot; after: StateSnapshot; previous?: OperationRecord;
  externalConflict?: boolean;
}
function canonicalPath(path: string): string {
  const canonical = realpathSync.native(resolve(path.replace(/^\\\\\?\\/,'')));
  return process.platform === 'win32' ? canonical.normalize('NFC').toLowerCase() : canonical;
}
function unrelatedConfig(snapshot: string|null, name: string, catalogRoot: string): string {
  const text = snapshot ? Buffer.from(snapshot,'base64').toString() : '';
  let owned: 'marketplace'|'plugin'|undefined;
  return text.replace(/\r\n/g,'\n').split('\n').filter(line => {
    const header = /^\s*\[([^\]]+)\]\s*(?:#.*)?$/.exec(line);
    if (header) {
      const normalized = header[1].replace(/[\s"']/g,'');
      owned = normalized === 'marketplaces.' + MARKETPLACE ? 'marketplace' : normalized === 'plugins.' + name + '@' + MARKETPLACE ? 'plugin' : undefined;
      return !owned;
    }
    if (owned) {
      const assignment = /^\s*([a-z_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (assignment) {
        const [, key, value] = assignment;
        if (owned === 'plugin' && key === 'enabled') {
          if (!/^true\s*(?:#.*)?$/.test(value)) throw new Error('O estado de ativação do plugin mudou. Confira a configuração antes de continuar.');
          return false;
        }
        if (owned === 'marketplace' && ['source_type','source'].includes(key)) {
          let parsed: unknown;
          try { parsed = value.startsWith("'") && value.endsWith("'") ? value.slice(1,-1) : JSON.parse(value); } catch { throw new Error('Registro do catálogo não reconhecido. Os arquivos foram preservados.'); }
          if (key === 'source_type' ? parsed !== 'local' : typeof parsed !== 'string' || canonicalPath(parsed) !== canonicalPath(catalogRoot)) throw new Error('O catálogo registrado aponta para outra origem. Os arquivos foram preservados.');
          return false;
        }
      }
    }
    return Boolean(line.trim());
  }).join('\n');
}
export async function saveBundle(store: OperationStore, bundle: ConversionBundle): Promise<void> {
  await store.save({ id: bundle.id, kind: 'bundle', state: bundle.installable ? 'ready' : 'blocked', title: bundle.pluginName, createdAt: new Date().toISOString(), data: { ...bundle, files: bundle.files.map(f => ({ ...f, data: f.data.toString('base64') })) } });
}
export async function loadBundle(store: OperationStore, id: string): Promise<ConversionBundle> {
  const record = await store.load(id); if (!record || record.kind !== 'bundle') throw new Error('Conversão não encontrada.');
  const bundle = { ...record.data, files: record.data.files.map((f: any) => ({ ...f, data: Buffer.from(f.data, 'base64') })) } as ConversionBundle;
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(bundle.pluginName) || validateBundle(bundle).some(f => f.severity === 'blocking')) throw new Error('A integridade do pacote não confere. Converta novamente.');
  return bundle;
}
export class CodexInstaller {
  readonly store: OperationStore; readonly home: string; readonly catalogRoot: string; readonly catalogPath: string; readonly configPath: string;
  constructor(private context: InstallerContext) {
    this.store = new OperationStore(context.dataRoot); this.home = resolve(context.codexHome || process.env.CODEX_HOME || join(homedir(), '.codex'));
    this.catalogRoot = join(context.dataRoot, 'marketplace'); this.catalogPath = join(this.catalogRoot, '.agents/plugins/marketplace.json'); this.configPath = join(this.home, 'config.toml');
  }
  private async run(args: string[], recovering = false): Promise<any> {
    if (this.context.run) return this.context.run(args);
    const result = await checkedProcess(this.context.codexPath, ['--disable','remote_plugin','--disable','hooks','--disable','skill_mcp_dependency_install',...args], {
      env: { ...process.env, CODEX_HOME: this.home }, signal: recovering ? undefined : this.context.signal, timeoutMs: 90000
    });
    return JSON.parse(result.stdout.toString());
  }
  private async state(): Promise<StateSnapshot> { return { config: await snapshotFile(this.configPath), catalog: await snapshotFile(this.catalogPath) }; }
  private async lock<T>(fn: () => Promise<T>): Promise<T> {
    await mkdir(this.context.dataRoot, { recursive: true }); const path = join(this.context.dataRoot, 'installation-lock');
    await assertOwnedPath(this.context.dataRoot, path);
    let file;
    try { file = await open(path, 'wx', 0o600); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const previous = await readFile(path, 'utf8'); const pid = Number(previous);
      let ended = false;
      if (Number.isSafeInteger(pid) && pid > 0 && pid <= 2147483647) {
        try { process.kill(pid, 0); } catch (probe) { ended = (probe as NodeJS.ErrnoException).code === 'ESRCH'; }
      }
      if (!ended || await readFile(path, 'utf8') !== previous) throw new Error('Outra instalação está em andamento.');
      await unlink(path); file = await open(path, 'wx', 0o600);
    }
    try { await file.writeFile(String(process.pid)); return await fn(); }
    finally { await file.close(); await unlink(path); }
  }
  private async checkpoint(record: OperationRecord): Promise<void> {
    const current = await this.state(); const tx = record.data as Transaction;
    if (unrelatedConfig(current.config, tx.pluginName, this.catalogRoot) !== unrelatedConfig(tx.after.config, tx.pluginName, this.catalogRoot)) {
      tx.externalConflict = true; await this.store.save(record); throw new Error('A configuração foi alterada externamente durante a operação.');
    }
    tx.after = current; await this.store.save(record);
  }
  private async catalog(name: string, bundleId?: string): Promise<void> {
    await assertOwnedPath(this.context.dataRoot, this.catalogPath);
    const previous = await snapshotFile(this.catalogPath);
    const catalog = previous ? JSON.parse(Buffer.from(previous,'base64').toString()) : { name: MARKETPLACE, interface: { displayName: 'Claude to Codex' }, plugins: [] };
    if (catalog.name !== MARKETPLACE || !Array.isArray(catalog.plugins)) throw new Error('Catálogo gerenciado inválido.');
    catalog.plugins = catalog.plugins.filter((p: any) => p.name !== name);
    if (bundleId) catalog.plugins.push({ name, source: { source: 'local', path: './plugins/' + bundleId }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Productivity' });
    await atomicWrite(this.catalogPath, JSON.stringify(catalog, null, 2));
  }
  private async writePackage(bundle: ConversionBundle): Promise<void> {
    const root = safeJoin(this.catalogRoot, 'plugins/' + bundle.id);
    for (const file of bundle.files) {
      const path = safeJoin(root, file.path); await assertOwnedPath(this.context.dataRoot, path); await atomicWrite(path, file.data);
    }
    await atomicWrite(join(root, 'conversion-provenance.json'), JSON.stringify(provenance(bundle), null, 2));
  }
  private async recognized(name: string, recovering = false): Promise<boolean> {
    const list = await this.run(['plugin','list','--marketplace',MARKETPLACE,'--json'], recovering);
    if (!list || !Array.isArray(list.installed)) throw new Error('Resposta de instalação do Codex desconhecida.');
    return list.installed.some((p: any) => p.pluginId === name + '@' + MARKETPLACE && p.installed === true);
  }
  async install(bundleId: string): Promise<InstallResult> { return this.perform('install', bundleId); }
    async verify(installationId: string): Promise<InstallationVerification> {
      const record = await this.store.load(installationId);
      if (!record || record.kind !== 'installation' || record.state !== 'installed') throw new Error('Instalação gerenciada não encontrada.');
      const bundle = await loadBundle(this.store,record.data.bundleId);
      if (record.title !== bundle.pluginName || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(record.title)) throw new Error('Identidade da instalação inválida.');
      const pluginId = record.title + '@' + MARKETPLACE; const checks: VerificationCheck[] = [];
      let entry: any;
      try {
        const list = await this.run(['plugin','list','--marketplace',MARKETPLACE,'--json']);
        if (!Array.isArray(list?.installed)) throw new Error('Resposta do CLI inválida.');
        entry = list.installed.find((item: any) => item.pluginId === pluginId && item.installed === true);
        checks.push({key:'recognized',label:'Reconhecimento no Codex',status:entry ? 'passed' : 'failed',detail:entry ? pluginId : 'O CLI não confirmou esta instalação.'});
      } catch (error) { checks.push({key:'recognized',label:'Reconhecimento no Codex',status:'failed',detail:(error as Error).message}); }
      const recognized = Boolean(entry), enabled = entry?.enabled === true;
      if (entry) {
        checks.push({key:'enabled',label:'Ativação',status:enabled ? 'passed' : 'failed',detail:enabled ? 'Plugin ativado no Codex.' : 'O CLI não confirmou que o plugin está ativado. Confira o plugin no Codex.'});
        const pathKey = (path: string) => { const value = resolve(path.replace(/^\\\\\?\\/,'')); return process.platform === 'win32' ? value.toLowerCase() : value; };
        const expectedSource = join(this.catalogRoot,'plugins',bundle.id);
        const sameSource = entry.source?.source === 'local' && typeof entry.source.path === 'string' && pathKey(entry.source.path) === pathKey(expectedSource);
        checks.push({key:'source',label:'Origem gerenciada',status:sameSource ? 'passed' : 'failed',detail:sameSource ? 'O plugin aponta para o pacote gerenciado pelo aplicativo.' : 'A origem nativa difere da instalação registrada.'});
        const manifest = bundle.files.find(file => file.path === '.codex-plugin/plugin.json');
        const version = manifest && JSON.parse(manifest.data.toString()).version;
        if (typeof version !== 'string' || !/^[0-9A-Za-z][0-9A-Za-z.+-]{0,80}$/.test(version) || entry.version !== version) checks.push({key:'files',label:'Arquivos no cache nativo',status:'failed',detail:'Versão do pacote nativo diferente da versão registrada.'});
        else {
          const ownedRoot = join(this.home,'plugins','cache'); const cacheRoot = join(ownedRoot,MARKETPLACE,record.title,version);
          const integrity = await verifyBundleFiles(bundle.files,cacheRoot,ownedRoot);
          checks.push({key:'files',label:'Arquivos no cache nativo',status:integrity.status,detail:integrity.status === 'passed' ? `${integrity.checkedFiles} arquivos conferidos por SHA-256.` : `${integrity.checkedFiles}/${bundle.files.length} arquivos conferidos. ${integrity.problems.join(' · ')}`});
        }
      }
      if (bundle.files.some(file => /\.py$/i.test(file.path))) {
        const python = await findPython();
        checks.push({key:'python',label:'Python para os scripts incluídos',status:python.path ? 'passed' : 'warning',detail:python.path ? `${python.version} · ${python.path}` : 'Python 3 não encontrado nas localizações verificadas. Selecione um Python disponível na sessão antes de usar os scripts.'});
      }
      if (bundle.files.some(file => file.path === '.mcp.json')) checks.push({key:'mcp',label:'Integrações externas',status:'warning',detail:'Conexões MCP, credenciais e serviços externos não são testados por esta verificação.'});
      const skillNames = bundle.files.filter(file => /^skills\/[^/]+\/SKILL\.md$/.test(file.path)).map(file => {try{const name=markdownMetadata(file.data.toString()).name;if(typeof name==='string'&&/^[a-z0-9][a-z0-9-]{0,59}$/.test(name))return name;}catch{}return file.path.split('/')[1];});
      const testPrompt = skillNames.length ? `Use a skill $${skillNames[0]}. Leia o SKILL.md instalado, confira seus recursos e dependências e proponha um teste funcional pequeno. Informe quais comandos serão necessários antes de executá-los. Ao executar o teste autorizado, mostre o comando e o resultado real; se um recurso faltar, informe o erro exato.` : undefined;
      return {installationId,pluginId,recognized,enabled,checkedAt:new Date().toISOString(),checks,testPrompt};
    }
  async update(installationId: string, bundleId: string): Promise<InstallResult> { return this.perform('update', bundleId, installationId); }
  async remove(installationId: string): Promise<InstallResult> { return this.perform('remove', undefined, installationId); }
  private async perform(action: Transaction['action'], bundleId?: string, installationId?: string): Promise<InstallResult> {
    return this.lock(async () => {
      const bundle = bundleId ? await loadBundle(this.store, bundleId) : undefined;
      if (bundle && (!bundle.installable || bundle.findings.some(f => f.severity === 'blocking'))) throw new Error('O pacote tem impedimentos. Resolva-os antes de instalar.');
      const previous = installationId ? await this.store.load(installationId) : undefined;
      if (action !== 'install' && (!previous || previous.kind !== 'installation' || previous.state === 'removed')) throw new Error('Instalação gerenciada não encontrada.');
      const pluginName = bundle?.pluginName || previous!.title;
      if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(pluginName)) throw new Error('Nome de plugin inválido.');
      if (previous && previous.title !== pluginName) throw new Error('A atualização não corresponde à instalação selecionada.');
      if (await lstat(this.home).then(s => s.isSymbolicLink()).catch(() => false)) throw new Error('A pasta do Codex não pode ser um link.');
      await mkdir(this.home,{ recursive: true });
      const installed = (await this.store.list()).find(r => r.kind === 'installation' && r.title === pluginName && r.state === 'installed');
      if (action === 'install' && (installed || await this.recognized(pluginName))) throw new Error('Plugin já instalado. Use Atualizar no histórico.');
      if (await lstat(this.home).then(s => s.isSymbolicLink()).catch(() => false)) throw new Error('A pasta do Codex não pode ser um link.');
      const id = randomUUID(); const targetId = installationId || randomUUID(); const before = await this.state();
      unrelatedConfig(before.config, pluginName, this.catalogRoot);
      const record: OperationRecord = { id, kind: 'transaction', title: pluginName, state: 'prepared', createdAt: new Date().toISOString(), data: { action, pluginName, installationId: targetId, bundleId, before, after: before, previous } satisfies Transaction };
      await this.store.save(record);
      try {
        if (bundle) { await this.writePackage(bundle); await this.catalog(pluginName, bundle.id); }
        else await this.catalog(pluginName);
        await this.checkpoint(record);
        if (bundle) {
          await this.run(['plugin','marketplace','add',this.catalogRoot,'--json']); await this.checkpoint(record);
          await this.run(['plugin','add',pluginName + '@' + MARKETPLACE,'--json']);
        } else await this.run(['plugin','remove',pluginName + '@' + MARKETPLACE,'--json']);
        await this.checkpoint(record);
        const recognized = await this.recognized(pluginName);
        if (recognized !== Boolean(bundle)) throw new Error('O Codex não confirmou o estado esperado da instalação.');
        await this.store.save({ id: targetId, kind: 'installation', state: bundle ? 'installed' : 'removed', title: pluginName, createdAt: previous?.createdAt || new Date().toISOString(), data: { bundleId: bundle?.id || previous?.data.bundleId, source: bundle?.source || previous?.data.source, sourceCommit: bundle?.sourceCommit || previous?.data.sourceCommit, componentId: bundle?.componentId || previous?.data.componentId, updatedAt: new Date().toISOString() } });
        record.state = 'verified'; await this.store.save(record);
        return { operationId: id, installationId: targetId, state: action === 'install' ? 'installed' : action === 'update' ? 'updated' : 'removed', recognized, findings: [{ code: 'restart-codex', severity: 'info', message: 'Abra uma nova conversa ou reinicie o Codex para carregar as alterações.' }] };
      } catch (error) {
        record.state = 'failed'; record.data.error = (error as Error).message;
        try { await this.checkpoint(record); } catch { record.data.externalConflict = true; await this.store.save(record); }
        const recovered = await this.restoreInternal(record);
        return { operationId: id, installationId: targetId, state: 'failed', recognized: false, findings: [{ code: 'installation-failed', severity: 'blocking', message: (error as Error).message }, ...recovered.findings] };
      }
    });
  }
  async restore(operationId: string): Promise<InstallResult> {
    return this.lock(async () => { const record = await this.store.load(operationId); if (!record || record.kind !== 'transaction') throw new Error('Operação de recuperação não encontrada.'); return this.restoreInternal(record); });
  }
  private async restoreInternal(record: OperationRecord): Promise<InstallResult> {
    const tx = record.data as Transaction; const current = await this.state();
    if (tx.externalConflict || !tx.before || !tx.after || current.config !== tx.after.config || current.catalog !== tx.after.catalog || record.state === 'restored') {
      return { operationId: record.id, state: 'conflict', recognized: false, findings: [{ code: 'recovery-conflict', severity: 'blocking', message: 'A configuração ou o catálogo mudou após esta operação. Os arquivos atuais foram preservados.' }] };
    }
    let expected = current;
    const guard = async (nativeChange = false): Promise<void> => {
      const state = await this.state();
      let configMatches = state.config === expected.config;
      try { if (nativeChange) configMatches = unrelatedConfig(state.config,tx.pluginName,this.catalogRoot) === unrelatedConfig(expected.config,tx.pluginName,this.catalogRoot); }
      catch { configMatches = false; }
      if (!configMatches || state.catalog !== expected.catalog) { tx.externalConflict = true; await this.store.save(record); throw new Error('A configuração ou catálogo foi alterado durante a recuperação.'); }
      expected = state;
    };
    try {
      if (await this.recognized(tx.pluginName, true)) { await guard(); await this.run(['plugin','remove',tx.pluginName + '@' + MARKETPLACE,'--json'], true); await guard(true); }
      await guard();
      await restoreFile(this.catalogPath, tx.before.catalog);
      expected.catalog = tx.before.catalog;
      if (tx.previous?.state === 'installed') {
        await guard(); await this.run(['plugin','marketplace','add',this.catalogRoot,'--json'], true); await guard(true);
        await this.run(['plugin','add',tx.pluginName + '@' + MARKETPLACE,'--json'], true); await guard(true);
        await this.store.save(tx.previous);
      } else {
        const currentInstallation = await this.store.load(tx.installationId);
        if (currentInstallation?.kind === 'installation') await this.store.save({ ...currentInstallation, state: 'removed' });
      }
      await guard(); await restoreFile(this.configPath, tx.before.config); record.state = 'restored'; await this.store.save(record);
      return { operationId: record.id, installationId: tx.installationId, state: 'restored', recognized: tx.previous?.state === 'installed', findings: [{ code: 'restored', severity: 'info', message: 'Estado anterior recuperado.' }] };
    } catch (error) {
      if (tx.externalConflict) return { operationId: record.id, state: 'conflict', recognized: false, findings: [{ code: 'recovery-conflict', severity: 'blocking', message: 'Mudança externa durante a recuperação. Os arquivos atuais foram preservados.' }] };
      record.state = 'recovery-failed'; await this.checkpoint(record);
      return { operationId: record.id, state: 'failed', recognized: false, findings: [{ code: 'recovery-failed', severity: 'blocking', message: 'Recuperação incompleta: ' + (error as Error).message }] };
    }
  }
}
