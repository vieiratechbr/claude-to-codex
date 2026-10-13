export interface Finding { code: string; severity: 'info'|'warning'|'blocking'; message: string; file?: string }
export interface SourceRequest { url: string; ref?: string; subdirectory?: string }
export interface SourceFile { path: string; mode: string; oid: string; data: Buffer }
export interface SourceSnapshot { id: string; request: SourceRequest; commit: string; files: SourceFile[]; warnings: string[] }
export interface SourceComponent { id: string; kind: 'skill'|'plugin'; root: string; name: string; files: string[]; findings: Finding[]; manifest?: Record<string,unknown> }
export interface BundleFile { path: string; data: Buffer; sha256: string; sourcePath?: string }
export interface ConversionBundle { id: string; pluginName: string; sourceCommit: string; files: BundleFile[]; findings: Finding[]; installable: boolean; source: SourceRequest; componentId: string; analysisId?: string }
export interface ProgressEvent { operationId: string; stage: string; message: string; completed?: number; total?: number }
export interface Diagnostics {
  gitPath?: string; codexPath?: string; gitVersion?: string; codexVersion?: string; authenticated: boolean;
  capabilities: { exec: boolean; pluginAdd: boolean; marketplaceAdd: boolean; pluginListJson: boolean; isolatedConversion: boolean };
  findings: Finding[];
}
export interface SourceLimits { maxFiles: number; maxFileBytes: number; maxTotalBytes: number }
export interface SourceContext { dataRoot: string; gitPath: string; signal?: AbortSignal; onProgress?: (p: ProgressEvent) => void }
export const SOURCE_LIMITS: SourceLimits = { maxFiles: 20000, maxFileBytes: 2 * 1024 * 1024, maxTotalBytes: 64 * 1024 * 1024 };
export interface ConversionOptions { useCodex: boolean; diagnostics: Diagnostics; dataRoot: string; signal?: AbortSignal; onProgress?: (p: ProgressEvent) => void }
export interface SemanticResult { files: { path: string; content: string }[]; findings: Finding[] }
export interface InstallResult { operationId: string; installationId?: string; state: 'installed'|'updated'|'removed'|'restored'|'conflict'|'failed'; recognized: boolean; findings: Finding[] }
