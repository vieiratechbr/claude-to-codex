import type { ConversionBundle } from '../shared/contracts';
export function provenance(bundle: ConversionBundle): Record<string,unknown> {
  return { converter: 'claude-to-codex', adapterVersion: '0.1.0', source: bundle.source, commit: bundle.sourceCommit, componentId: bundle.componentId, convertedAt: new Date().toISOString(), findings: bundle.findings, files: bundle.files.map(f => ({ path: f.path, sha256: f.sha256, bytes: f.data.length })) };
}
