import { expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppService } from '../../src/main/service';
import { inventorySource } from '../../src/core/inventory';
import { loadBundle } from '../../src/core/installer';
import { digest } from '../../src/core/conversion';
import type { SourceSnapshot } from '../../src/shared/contracts';
it('preserva a identidade nativa ao preparar atualização de uma instalação anterior por pasta', async () => {
  const root = await mkdtemp(join(tmpdir(), 'c2c-update-identity-'));
  try {
    const snapshot: SourceSnapshot = { id: 'fixture-analysis', request: { url: 'https://github.com/acme/design.git', subdirectory: '.claude/skills/design' }, commit: 'b'.repeat(40), warnings: [], files: [{ path: 'SKILL.md', mode: '100644', oid: '', data: Buffer.from('---\nname: design\ndescription: Design\n---\nUpdated advice.') }] };
    const service = new AppService({ dataRoot: root, readSource: async () => snapshot, diagnose: async () => ({ gitPath: 'fixture-git', authenticated: false, capabilities: { exec: false, pluginAdd: true, marketplaceAdd: true, pluginListJson: true, isolatedConversion: false }, findings: [] }) });
    const legacyName = 'acme-design-be175f1b';
    await service.store.save({ id: 'old-installation', kind: 'installation', state: 'installed', title: legacyName, createdAt: '2026-10-13', data: { source: snapshot.request, sourceCommit: 'a'.repeat(40), componentId: inventorySource(snapshot)[0].id } });
    const [view] = await service.prepareUpdate('old-installation', false);
    const bundle = await loadBundle(service.store, view.id);
    expect(bundle.pluginName).toBe(legacyName);
    const manifest = bundle.files.find(f => f.path === '.codex-plugin/plugin.json')!;
    expect(JSON.parse(manifest.data.toString()).name).toBe(legacyName);
    expect(manifest.sha256).toBe(digest(manifest.data));
    expect(bundle.source.subdirectory).toBe('.claude/skills/design');
    expect(bundle.installable).toBe(true);
  } finally { await rm(root, { recursive: true, force: true }); }
});
