import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { readFile, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import type { Diagnostics, SourceRequest, SourceSnapshot, ConversionBundle, ProgressEvent, InstallResult } from '../shared/contracts';
import type { AnalysisView, BundleView, HistoryView } from '../shared/api';
import { acquireSource, parseSourceRequest } from '../core/source';
import { diagnoseCodex } from '../core/codex';
import { inventorySource } from '../core/inventory';
import { convertComponents } from '../core/conversion';
import { OperationStore, atomicWrite } from '../core/store';
import { CodexInstaller, saveBundle, loadBundle } from '../core/installer';
import { assertOwnedPath } from '../core/paths';
import { redact } from '../core/process';
interface ServiceContext {
  dataRoot: string; codexHome?: string; onProgress?: (event: ProgressEvent) => void;
  diagnose?: () => Promise<Diagnostics>; readSource?: (request: SourceRequest) => Promise<SourceSnapshot>;
}
export function bundleView(bundle: ConversionBundle): BundleView {
  return { id: bundle.id, pluginName: bundle.pluginName, sourceCommit: bundle.sourceCommit, source: bundle.source, findings: bundle.findings, installable: bundle.installable, files: bundle.files.map(f => ({ path: f.path, bytes: f.data.length, sha256: f.sha256 })) };
}
export class AppService {
  readonly store: OperationStore; private active?: { id: string; controller: AbortController };
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
  private async job<T>(stage: string, action: (signal: AbortSignal, progress: (p: ProgressEvent) => void) => Promise<T>): Promise<T> {
    if (this.active) throw new Error('Aguarde ou cancele a operação em andamento.');
    const id = randomUUID(); const controller = new AbortController(); this.active = { id, controller };
    const progress = (event: ProgressEvent) => this.context.onProgress?.({ ...event, operationId: id });
    progress({ operationId: id, stage, message: 'Operação em andamento.' });
    try { const value = await action(controller.signal, progress); progress({ operationId: id, stage: 'done', message: 'Operação concluída.' }); return value; }
    catch (error) { progress({ operationId: id, stage: controller.signal.aborted ? 'cancelled' : 'error', message: redact((error as Error).message) }); throw error; }
    finally { this.active = undefined; }
  }
  cancel(id: string): boolean { if (!this.active || this.active.id !== id) return false; this.active.controller.abort(); return true; }
  async analyze(input: unknown): Promise<AnalysisView> {
    const request = parseSourceRequest(input);
    return this.job('analysis', async (signal, onProgress) => {
      const diagnostic = await this.diagnose(); if (!diagnostic.gitPath) throw new Error('Git não encontrado. Instale o Git para baixar repositórios.');
      const snapshot = this.context.readSource ? await this.context.readSource(request) : await acquireSource(request, { dataRoot: this.context.dataRoot, gitPath: diagnostic.gitPath, signal, onProgress });
      const components = inventorySource(snapshot);
      if (!components.length) throw new Error('Nenhum plugin ou SKILL.md encontrado. Confira a pasta ou o formato do repositório.');
      await this.store.save({ id: snapshot.id, kind: 'analysis', state: 'ready', createdAt: new Date().toISOString(), title: request.url.replace('https://github.com/',''), data: { ...snapshot, files: snapshot.files.map(f => ({ ...f, data: f.data.toString('base64') })) } });
      return { id: snapshot.id, request: snapshot.request, commit: snapshot.commit, warnings: snapshot.warnings, components: components.map(c => ({ id: c.id, kind: c.kind, root: c.root, name: c.name, fileCount: c.files.length, findings: c.findings })) };
    });
  }
  async convert(analysisId: string, componentIds: string[], useCodex: boolean): Promise<BundleView[]> {
    return this.job('conversion', async (signal, onProgress) => {
      const record = await this.store.load(analysisId); if (!record || record.kind !== 'analysis') throw new Error('Análise não encontrada.');
      const snapshot = { ...record.data, files: record.data.files.map((f: any) => ({ ...f, data: Buffer.from(f.data,'base64') })) } as SourceSnapshot;
      const bundles = await convertComponents(snapshot, componentIds, { dataRoot: this.context.dataRoot, diagnostics: await this.diagnose(), useCodex, signal, onProgress });
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
  async applyUpdate(installationId: string, bundleId: string): Promise<InstallResult> {
    return this.job('installation', async signal => (await this.installer(signal)).update(installationId, bundleId));
  }
  async prepareUpdate(id: string, useCodex: boolean): Promise<BundleView[]> {
    const record = await this.store.load(id); if (!record || record.kind !== 'installation' || record.state !== 'installed') throw new Error('Instalação não encontrada.');
    const analysis = await this.analyze(record.data.source);
    if (!analysis.components.some(c => c.id === record.data.componentId)) throw new Error('O componente mudou de localização. Faça uma nova análise e confira a migração.');
    return this.convert(analysis.id, [record.data.componentId], useCodex);
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
    return (await this.store.list()).map(r => ({ id: r.id, kind: r.kind, title: r.title, state: r.state, createdAt: r.createdAt, source: r.kind === 'transaction' ? undefined : r.data?.source || r.data?.request, sourceCommit: r.data?.sourceCommit || r.data?.commit }));
  }
  async reviewBundle(id: string): Promise<BundleView> { return bundleView(await loadBundle(this.store,id)); }
  async cleanDownloads(): Promise<void> {
    if (this.active) throw new Error('Aguarde a operação em andamento.');
    const path = join(this.context.dataRoot, 'sources'); await assertOwnedPath(this.context.dataRoot, path); await rm(path, { recursive: true, force: true });
  }
}
