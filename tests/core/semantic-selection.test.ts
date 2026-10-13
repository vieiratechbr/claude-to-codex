import { expect, it, vi } from 'vitest';
import { convertComponents } from '../../src/core/conversion';
import { inventorySource } from '../../src/core/inventory';
import { adaptWithCodex } from '../../src/core/semantic';
import type { SourceSnapshot } from '../../src/shared/contracts';
vi.mock('../../src/core/semantic', () => ({ adaptWithCodex: vi.fn() }));
it('envia apenas skills ativas para o modelo e preserva cópias inativas do repositório', async () => {
  const input: SourceSnapshot = { id: 'fixture', request: { url: 'https://github.com/acme/design.git' }, commit: 'a'.repeat(40), warnings: [], files: Object.entries({
    '.claude-plugin/plugin.json': '{"name":"design"}',
    'skills/design/SKILL.md': 'Use Claude Code to give design advice.',
    'cli/assets/skills/design/SKILL.md': 'Claude Code CLI template; keep this original copy.'
  }).map(([path, text]) => ({ path, data: Buffer.from(text), mode: '100644', oid: '' })) };
  vi.mocked(adaptWithCodex).mockImplementation(async request => {
    expect(request.files.map(f => f.path)).toEqual(['skills/design/SKILL.md']);
    return { files: request.files.map(f => ({ ...f, content: f.content.replace('Claude Code', 'Codex') })), findings: [] };
  });
  const [bundle] = await convertComponents(input, inventorySource(input).map(c => c.id), { useCodex: true, dataRoot: 'unused', diagnostics: { authenticated: false, capabilities: { exec: false, pluginAdd: true, marketplaceAdd: true, pluginListJson: true, isolatedConversion: false }, findings: [] } });
  expect(bundle.installable).toBe(true);
  expect(bundle.files.find(f => f.path.startsWith('cli/'))?.data.toString()).toBe('Claude Code CLI template; keep this original copy.');
});
