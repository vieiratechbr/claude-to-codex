import type { Diagnostics, Finding, InstallResult, ProgressEvent, SourceRequest } from './contracts';
import type { InstallationVerification } from './verification';
import type { AppUpdate } from './updates';
export interface ComponentView { id: string; kind: 'skill'|'plugin'; root: string; name: string; fileCount: number; findings: Finding[]; parentPluginId?: string }
export interface AnalysisView { id: string; request: SourceRequest; commit: string; components: ComponentView[]; warnings: string[] }
export interface BundleView { id: string; pluginName: string; sourceCommit: string; source: SourceRequest; findings: Finding[]; installable: boolean; analysisId?: string; files: { path: string; bytes: number; sha256: string }[] }
export interface HistoryView { id: string; kind: string; title: string; state: string; createdAt: string; source?: SourceRequest; sourceCommit?: string }
export interface AppApi {
  diagnose(): Promise<Diagnostics>;
  settings(): Promise<{ dataRoot: string; codexHome: string; codexPath?: string }>;
  analyze(input: SourceRequest): Promise<AnalysisView>;
  convert(input: { analysisId: string; componentIds: string[]; useCodex: boolean }): Promise<BundleView[]>;
  install(id: string): Promise<InstallResult>;
  verifyInstallation(id: string): Promise<InstallationVerification>;
  checkForUpdates(): Promise<AppUpdate>;
  openAppUpdate(url: string): Promise<void>;
  copyText(text:string): Promise<void>;
  prepareUpdate(input: { installationId: string; useCodex: boolean }): Promise<BundleView[]>;
  applyUpdate(input: { installationId: string; bundleId: string }): Promise<InstallResult>;
  remove(id: string): Promise<InstallResult>;
  restore(id: string): Promise<InstallResult>;
  listHistory(): Promise<HistoryView[]>;
  reviewBundle(id: string): Promise<BundleView>;
  preview(input: { bundleId: string; path: string }): Promise<{ text: string; original?: string; binary: boolean; truncated: boolean }>;
  exportBundle(id: string): Promise<{ path?: string }>;
  selectCodexExecutable(): Promise<Diagnostics>;
  openDataFolder(): Promise<void>;
  cleanDownloads(): Promise<void>;
  cancel(id: string): Promise<boolean>;
  onProgress(callback: (event: ProgressEvent) => void): () => void;
}
