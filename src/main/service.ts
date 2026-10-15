import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { readFile, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import type { Diagnostics, SourceRequest, SourceSnapshot, ConversionBundle, ProgressEvent, InstallResult } from '../shared/contracts';
import type { AnalysisView, BundleView, HistoryView } from '../shared/api';
import { acquireSource, parseSourceRequest } from '../core/source';
import { diagnoseCodex } from '../core/codex';
import { inventorySource } from '../core/inventory';
import { convertComponents, digest } from '../core/conversion';
import { OperationStore, atomicWrite } from '../core/store';
import { CodexInstaller, saveBundle, loadBundle } from '../core/installer';
import { assertOwnedPath } from '../core/paths';
import { redact } from '../core/process';
import { checkForAppUpdates } from '../core/updates';
import type { AppUpdate } from '../shared/updates';
import type { InstallationVerification } from '../shared/verification';
import { APP_VERSION } from '../shared/version';
import {skillCalls} from '../core/skill-calls';
interface ServiceContext {
  dataRoot: string; codexHome?: string; onProgress?: (event: ProgressEvent) => void;
  diagnose?: () => Promise<Diagnostics>; readSource?: (request: SourceRequest) => Promise<SourceSnapshot>;
  updates?: () => Promise<AppUpdate>;
}
export function bundleView(bundle: ConversionBundle): BundleView {
  return { id: bundle.id, pluginName: bundle.pluginName, sourceCommit: bundle.sourceCommit, source: bundle.source, findings: bundle.findings, installable: bundle.installable, analysisId:bundle.analysisId,invocations:skillCalls(bundle.files,bundle.entrySkill),entrySkill:bundle.entrySkill, files: bundle.files.map(f => ({ path: f.path, bytes: f.data.length, sha256: f.sha256 })) };
}
export class AppService {
  readonly store: OperationStore; private active?: { id: string; controller: AbortController };
  private idleWaiters: (() => void)[] = [];
  get isBusy(): boolean { return Boolean(this.active); }
  waitUntilIdle(): Promise<void> { return this.active ? new Promise(resolve => this.idleWaiters.push(resolve)) : Promise.resolve(); }
  constructor(readonly context: ServiceContext) { this.store = new OperationStore(context.dataRoot); }
  async settings(): Promise<{ dataRoot: string; codexHome: string; codexPath?: string }> {
    let codexPath: string|undefined;
    try { codexPath = JSON.parse(await readFile(join(this.context.dataRoot, 'settings.json'), 'utf8')).codexPath; } catch {}
    return { dataRoot: this.context.dataRoot, codexHome: this.context.codexHome || process.env.CODEX_HOME || join(homedir(),'.codex'), codexPath };
  }
  async selectCodex(path: string): Promise<Diagnostics> {
    if (this.active) throw new Error('Aguarde a operação em andamento.');
    await atomicWrite(join(this.context.dataRoot, 'settings.json'), JSON.stringify({ codexPath: path }));
    return this.diagnose();
  }
  async diagnose(): Promise<Diagnostics> { return this.context.diagnose ? this.context.diagnose() : diagnoseCodex(await this.settings()); }
  async checkForUpdates(): Promise<AppUpdate> { return this.context.updates ? this.context.updates() : checkForAppUpdates(APP_VERSION); }
  private async job<T>(stage: string, action: (signal: AbortSignal, progress: (p: ProgressEvent) => void) => Promise<T>): Promise<T> {
    if (this.active) throw new Error('Aguarde ou cancele a operação em andamento.');
    const id = randomUUID(); const controller = new AbortController(); this.active = { id, controller };
    const progress = (event: ProgressEvent) => this.context.onProgress?.({ ...event, operationId: id });
    progress({ operationId: id, stage, message: 'Operação em andamento.' });
    try { const value = await action(controller.signal, progress); progress({ operationId: id, stage: 'done', message: 'Operação concluída.' }); return value; }
    catch (error) { progress({ operationId: id, stage: controller.signal.aborted ? 'cancelled' : 'error', message: redact((error as Error).message) }); throw error; }
    finally { this.active = undefined; for (const resolve of this.idleWaiters.splice(0)) resolve(); }
  }
  cancel(id: string): boolean { if (!this.active || this.active.id !== id) return false; this.active.controller.abort(); return true; }
  async analyze(input: unknown): Promise<AnalysisView> {
    const request = parseSourceRequest(input);
    return this.job('analysis', async (signal, onProgress) => {
      const diagnostic = await this.diagnose(); if (!diagnostic.gitPath) throw new Error('Git não encontrado. Instale o Git for Windows e reabra o aplicativo para baixar repositórios.');
      const snapshot = this.context.readSource ? await this.context.readSource(request) : await acquireSource(request, { dataRoot: this.context.dataRoot, gitPath: diagnostic.gitPath, signal, onProgress });
      const components = inventorySource(snapshot);
      if (!components.length) throw new Error('Nenhum plugin ou SKILL.md encontrado. Confira a pasta ou o formato do repositório.');
      await this.store.save({ id: snapshot.id, kind: 'analysis', state: 'ready', createdAt: new Date().toISOString(), title: request.url.replace('https://github.com/',''), data: { ...snapshot, files: snapshot.files.map(f => ({ ...f, data: f.data.toString('base64') })) } });
      return { id: snapshot.id, request: snapshot.request, commit: snapshot.commit, warnings: snapshot.warnings, components: components.map(c => ({ id: c.id, kind: c.kind, root: c.root, name: c.name, fileCount: c.files.length, findings: c.findings, parentPluginId: c.parentPluginId })) };
    });
  }
  async convert(analysisId: string, componentIds: string[], useCodex: boolean,asPackage=false,packageEntry?:string): Promise<BundleView[]> {
    return this.job('conversion', async (signal, onProgress) => {
      const record = await this.store.load(analysisId); if (!record || record.kind !== 'analysis') throw new Error('Análise não encontrada.');
      const snapshot = { ...record.data, files: record.data.files.map((f: any) => ({ ...f, data: Buffer.from(f.data,'base64') })) } as SourceSnapshot;
      const bundles = await convertComponents(snapshot, componentIds, { dataRoot: this.context.dataRoot, diagnostics: await this.diagnose(), useCodex, signal, onProgress,asPackage,packageEntry });
      if (signal.aborted) throw new Error('Operação cancelada.');
      for (const bundle of bundles) await saveBundle(this.store, bundle);
      return bundles.map(bundleView);
    });
  }
  private async installer(signal?: AbortSignal): Promise<CodexInstaller> {
    const diagnostic = await this.diagnose();
    if (!diagnostic.codexPath || !diagnostic.capabilities.pluginAdd || !diagnostic.capabilities.marketplaceAdd || !diagnostic.capabilities.pluginListJson) throw new Error('Atualize ou selecione o Codex com suporte a plugins e marketplaces locais.');
    return new CodexInstaller({ dataRoot: this.context.dataRoot, codexPath: diagnostic.codexPath, codexHome: (await this.settings()).codexHome, signal });
  }
  async install(id: string): Promise<InstallResult> {
    await loadBundle(this.store, id);
    return this.job('installation', async signal => (await this.installer(signal)).install(id));
  }
  async verifyInstallation(id: string): Promise<InstallationVerification> {
    return this.job('verification',async signal => {
      const record = await this.store.load(id); let installationId = id;
      if (record?.kind === 'bundle') {
        const installed = (await this.store.list()).find(item => item.kind === 'installation' && item.state === 'installed' && item.data.bundleId === id);
        if (!installed) throw new Error('Instalação deste pacote não encontrada.');
        installationId = installed.id;
      }
      const result = await (await this.installer(signal)).verify(installationId);
      if (signal.aborted) throw new Error('Operação cancelada.');
      return result;
    });
  }
  async applyUpdate(installationId: string, bundleId: string): Promise<InstallResult> {
    return this.job('installation', async signal => (await this.installer(signal)).update(installationId, bundleId));
  }
  async prepareUpdate(id: string, useCodex: boolean): Promise<BundleView[]> {
    const record = await this.store.load(id); if (!record || record.kind !== 'installation' || record.state !== 'installed') throw new Error('Instalação não encontrada.');
    const analysis = await this.analyze(record.data.source);
    const componentIds=record.data.groupAll===true?analysis.components.filter(c=>c.kind==='skill').map(c=>c.id):record.data.componentIds||[record.data.componentId];
    if (!componentIds.length||componentIds.some((id:string)=>!analysis.components.some(c=>c.id===id))) throw new Error('O componente mudou de localização. Faça uma nova análise e confira a migração.');
    const previous=record.data.asPackage===true&&typeof record.data.bundleId==='string'?await loadBundle(this.store,record.data.bundleId):undefined;
    const views = await this.convert(analysis.id, componentIds, useCodex,record.data.asPackage===true,previous?.entrySkill);
    const updated: BundleView[] = [];
    for (const view of views) {
      const bundle = await loadBundle(this.store, view.id);
      if (bundle.pluginName !== record.title) {
        if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(record.title)) throw new Error('Identidade da instalação inválida.');
        const manifest = bundle.files.find(file => file.path === '.codex-plugin/plugin.json');
        if (!manifest) throw new Error('Manifest da atualização ausente.');
        const metadata = JSON.parse(manifest.data.toString()); metadata.name = record.title;
        manifest.data = Buffer.from(JSON.stringify(metadata, null, 2)); manifest.sha256 = digest(manifest.data);
        bundle.pluginName = record.title; await saveBundle(this.store, bundle);
      }
      updated.push(bundleView(bundle));
    }
    return updated;
  }
  async remove(id: string): Promise<InstallResult> { return this.job('removal', async signal => (await this.installer(signal)).remove(id)); }
  async restore(id: string): Promise<InstallResult> { return this.job('recovery', async signal => (await this.installer(signal)).restore(id)); }
  async readPreview(id: string, path: string): Promise<{ text: string; original?: string; binary: boolean; truncated: boolean }> {
    const bundle = await loadBundle(this.store, id); const file = bundle.files.find(f => f.path === path); if (!file) throw new Error('Arquivo não pertence a esta conversão.');
    const binary = file.data.includes(0); const truncated = file.data.length > 100000;
    let original: string|undefined;
    if (!binary && file.sourcePath && bundle.analysisId) {
      const source = await this.store.load(bundle.analysisId);
      if (source?.kind === 'analysis') { const origin = source.data.files.find((f: any) => f.path === file.sourcePath); if (origin) original = Buffer.from(origin.data,'base64').subarray(0,100000).toString(); }
    }
    return { text: binary ? 'Arquivo binário. Exporte o pacote para inspecionar.' : file.data.subarray(0,100000).toString(), original, binary, truncated };
  }
  async listHistory(): Promise<HistoryView[]> {
    const records=await this.store.list();const bundles=new Map(records.filter(r=>r.kind==='bundle').map(r=>[r.id,r]));
    return records.map(r=>{
      const bundle=r.kind==='bundle'?r:r.kind==='installation'?bundles.get(r.data?.bundleId):undefined;
      const files=Array.isArray(bundle?.data?.files)?bundle.data.files.filter((f:any)=>typeof f?.path==='string'&&/^skills\/[^/]+\/SKILL\.md$/.test(f.path)&&typeof f?.data==='string'&&f.data.length<2800000).map((f:any)=>({path:f.path,data:Buffer.from(f.data,'base64')})):[];
      const invocations=skillCalls(files,bundle?.data?.entrySkill);const entrySkill=typeof bundle?.data?.entrySkill==='string'&&invocations.includes('$'+bundle.data.entrySkill)?bundle.data.entrySkill:undefined;
      return {id:r.id,kind:r.kind,title:r.title,state:r.state,createdAt:r.createdAt,source:r.kind==='transaction'?undefined:r.data?.source||r.data?.request,sourceCommit:r.data?.sourceCommit||r.data?.commit,invocations,entrySkill};
    });
  }
  async reviewBundle(id: string): Promise<BundleView> { return bundleView(await loadBundle(this.store,id)); }
  async cleanDownloads(): Promise<void> {
    if (this.active) throw new Error('Aguarde a operação em andamento.');
    const path = join(this.context.dataRoot, 'sources'); await assertOwnedPath(this.context.dataRoot, path); await rm(path, { recursive: true, force: true });
  }
}
