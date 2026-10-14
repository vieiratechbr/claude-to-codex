import { expect, it } from 'vitest';
import { inventorySource } from '../../src/core/inventory';
import { convertComponents } from '../../src/core/conversion';
import type { Diagnostics, SourceSnapshot } from '../../src/shared/contracts';

const diagnostics: Diagnostics = { authenticated: false, capabilities: { exec: false, pluginAdd: true, marketplaceAdd: true, pluginListJson: true, isolatedConversion: false }, findings: [] };
const options = { useCodex: false, diagnostics, dataRoot: 'unused-in-structural-tests' };
function source(files: Record<string,string>): SourceSnapshot {
  return { id: 'fixture', request: { url: 'https://github.com/acme/test.git' }, commit: 'a'.repeat(40), warnings: [],
    files: Object.entries(files).map(([path, text]) => ({ path, data: Buffer.from(text), oid: '', mode: '100644' })) };
}
function designFixture(): SourceSnapshot {
  return source({
    '.claude-plugin/plugin.json': '{"name":"design","skills":"./.claude/skills","hooks":{"Stop":[]},"mcpServers":{"docs":{"type":"http","url":"https://example.invalid/mcp"}},"lspServers":{"demo":{}}}',
    '.claude/skills/design/SKILL.md': '---\nname: design\ndescription: Design\n---\nRead [guide](../../../shared/guide.md). Run `scripts/search.py`.',
    '.claude/skills/design/scripts/search.py': 'print("portable fixture")',
    '.claude/skills/other/SKILL.md': 'Other advice.',
    'shared/guide.md': 'Read [details](details.md).',
    'shared/details.md': 'Shared details.',
    'LICENSE': 'Root license.',
    '.claude/LICENSE': 'Ancestor license.',
    'cli/assets/claude/SKILL.md': 'Inert CLI template.'
  });
}
it('converte a skill escolhida com referências transitivas e licenças ancestrais', async () => {
  const input = designFixture();
  const child = inventorySource(input).find(c => c.root === '.claude/skills/design');
  expect(child, 'A skill ativa precisa ser uma escolha individual.').toBeDefined();
  const [bundle] = await convertComponents(input, [child!.id], options);
  expect(bundle.installable).toBe(true);
  expect(bundle.files.filter(f => f.path.endsWith('/SKILL.md')).map(f => f.path)).toEqual(['skills/design/SKILL.md']);
  expect(bundle.files.find(f => f.path === 'skills/design/scripts/search.py')?.data.toString()).toBe('print("portable fixture")');
  expect(bundle.files.find(f => f.path === 'shared/guide.md')?.data.toString()).toBe('Read [details](details.md).');
  expect(bundle.files.find(f => f.path === 'shared/details.md')?.data.toString()).toBe('Shared details.');
  expect(bundle.files.find(f => f.path === 'LICENSE')?.data.toString()).toBe('Root license.');
  expect(bundle.files.find(f => f.path === '.claude/LICENSE')?.data.toString()).toBe('Ancestor license.');
  expect(bundle.files.some(f => f.path === '.mcp.json' || f.path.startsWith('hooks/'))).toBe(false);
  expect(bundle.findings.some(f => ['unsupported-hook', 'unsupported-manifest-field', 'mcp-setup'].includes(f.code))).toBe(false);
});
it('mantém o plugin completo selecionável com seus próprios impedimentos', async () => {
  const input = designFixture();
  const parent = inventorySource(input).find(c => c.kind === 'plugin')!;
  const [bundle] = await convertComponents(input, [parent.id], options);
  expect(bundle.installable).toBe(false);
  expect(bundle.files.some(f => f.path === 'skills/design/SKILL.md')).toBe(true);
  expect(bundle.files.some(f => f.path === 'skills/other/SKILL.md')).toBe(true);
  expect(bundle.findings.some(f => f.code === 'unsupported-hook')).toBe(true);
  expect(bundle.findings.some(f => f.code === 'unsupported-manifest-field')).toBe(true);
});
it('rejeita plugin completo junto de sua skill antes de iniciar conversão', async () => {
  const input = designFixture();
  const items = inventorySource(input);
  expect(items.some(c => c.kind === 'skill'), 'A skill ativa precisa estar disponível para a guarda de seleção.').toBe(true);
  await expect(convertComponents(input, items.map(c => c.id), options)).rejects.toThrow(/sobreposta|plugin completo/i);
});
it('preserva a identidade de instalação de uma skill importada por pasta', async () => {
  const input = designFixture();
  const child = inventorySource(input).find(c => c.root === '.claude/skills/design');
  expect(child).toBeDefined();
  const simple = source({ 'SKILL.md': '---\nname: design\ndescription: Design\n---\nDesign advice.' });
  simple.request.subdirectory = '.claude/skills/design';
  const [nestedBundle] = await convertComponents(input, [child!.id], options);
  const [scopedBundle] = await convertComponents(simple, [inventorySource(simple)[0].id], options);
  expect(nestedBundle.pluginName).toBe(scopedBundle.pluginName);
});
it('mantém uma dependência explícita de outra skill como impedimento', async () => {
  const input = source({
    '.claude-plugin/plugin.json': '{"name":"dependent"}',
    'skills/primary/SKILL.md': 'Read [helper](../helper/SKILL.md).',
    'skills/helper/SKILL.md': 'Helper instructions.'
  });
  const child = inventorySource(input).find(c => c.root === 'skills/primary');
  expect(child).toBeDefined();
  const [bundle] = await convertComponents(input, [child!.id], options);
  expect(bundle.installable).toBe(false);
  expect(bundle.findings.some(f => f.code === 'missing-reference' && f.severity === 'blocking')).toBe(true);
  expect(bundle.files.some(f => f.path === 'skills/helper/SKILL.md')).toBe(false);
});
it('não herda integrações do plugin quando a skill ativa está na própria raiz', async () => {
  const input = source({
    '.claude-plugin/plugin.json': '{"name":"root-skill","skills":".","hooks":{"Stop":[]}}',
    'SKILL.md': '---\nname: root-skill\ndescription: Skill da raiz\n---\nPortable advice.',
    '.mcp.json': '{"mcpServers":{"docs":{"type":"http","url":"https://example.invalid/mcp"}}}',
    'hooks/hooks.json': '{"hooks":{"Stop":[]}}'
  });
  const child = inventorySource(input).find(c => c.kind === 'skill');
  expect(child).toBeDefined();
  const [bundle] = await convertComponents(input, [child!.id], options);
  expect(bundle.installable).toBe(true);
  expect(bundle.files.some(f => f.path === '.mcp.json')).toBe(false);
  expect(bundle.findings.some(f => f.code === 'unsupported-hook' || f.code === 'mcp-setup')).toBe(false);
});
it('identifica a skill que precisa de adaptação assistida no pacote completo',async()=>{
  const input=source({'.claude-plugin/plugin.json':'{"name":"design"}','skills/portable/SKILL.md':'Portable guidance.','skills/design/SKILL.md':'Use Claude Code for design.'});
  const [bundle]=await convertComponents(input,[inventorySource(input).find(c=>c.kind==='plugin')!.id],options);
  expect(bundle.findings.filter(f=>f.code==='semantic-needed').map(f=>f.file)).toEqual(['skills/design/SKILL.md']);
});
