import type { Diagnostics, Finding, InstallResult, ProgressEvent, SourceRequest } from './contracts';
export interface ComponentView { id: string; kind: 'skill'|'plugin'; root: string; name: string; fileCount: number; findings: Finding[] }
export interface AnalysisView { id: string; request: SourceRequest; commit: string; components: ComponentView[]; warnings: string[] }
export interface BundleView { id: string; pluginName: string; sourceCommit: string; source: SourceRequest; findings: Finding[]; installable: boolean; files: { path: string; bytes: number; sha256: string }[] }
export interface HistoryView { id: string; kind: string; title: string; state: string; createdAt: string; source?: SourceRequest; sourceCommit?: string }
export interface AppApi {
  diagnose(): Promise<Diagnostics>;
  settings(): Promise<{ dataRoot: string; codexHome: string; codexPath?: string }>;
  analyze(input: SourceRequest): Promise<AnalysisView>;
  convert(input: { analysisId: string; componentIds: string[]; useCodex: boolean }): Promise<BundleView[]>;
  install(id: string): Promise<InstallResult>;
  prepareUpdate(input: { installationId: string; useCodex: boolean }): Promise<BundleView[]>;
  applyUpdate(input: { installationId: string; bundleId: string }): Promise<InstallResult>;
  remove(id: string): Promise<InstallResult>;
  restore(id: string): Promise<InstallResult>;
  listHistory(): Promise<HistoryView[]>;
  preview(input: { bundleId: string; path: string }): Promise<{ text: string; binary: boolean; truncated: boolean }>;
  exportBundle(id: string): Promise<{ path?: string }>;
  selectCodexExecutable(): Promise<Diagnostics>;
  openDataFolder(): Promise<void>;
  cleanDownloads(): Promise<void>;
  cancel(id: string): Promise<boolean>;
  onProgress(callback: (event: ProgressEvent) => void): () => void;
}
