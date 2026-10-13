import { expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AppService } from '../../src/main/service';
it('mantém IDs e estados no processo principal sem aceitar seleção forjada', async () => {
  const root = await mkdtemp(join(tmpdir(), 'c2c-service-'));
  try {
    const service = new AppService({ dataRoot: root, diagnose: async () => ({ gitPath: 'git', codexPath: 'fixture', authenticated: false, capabilities: { exec: true, pluginAdd: true, marketplaceAdd: true, pluginListJson: true, isolatedConversion: true }, findings: [] }), readSource: async request => ({ id: 'source-fixture', request, commit: 'a'.repeat(40), warnings: [], files: [{ path: 'SKILL.md', mode: '100644', oid: '', data: Buffer.from('---\nname: hello\ndescription: Fixture\n---\nOlá.') }] }) });
    await expect(service.install('unknown')).rejects.toThrow();
    expect(service.cancel('unknown')).toBe(false);
    const analysis = await service.analyze({ url: 'https://github.com/acme/fixture' });
    expect(analysis.components).toHaveLength(1);
    await expect(service.convert(analysis.id, ['forged'], false)).rejects.toThrow();
    const [bundle] = await service.convert(analysis.id, [analysis.components[0].id], false);
    expect(bundle.installable).toBe(true);
    const preview = await service.readPreview(bundle.id, bundle.files.find(f => f.path.endsWith('SKILL.md'))!.path);
    expect(preview.text).toContain('Olá.');
    expect(preview.original).toContain('name: hello');
    await expect(service.readPreview(bundle.id, '../config.toml')).rejects.toThrow();
    expect((await service.listHistory()).some(r => r.kind === 'bundle')).toBe(true);
  } finally { await rm(root, { recursive: true, force: true }); }
});
