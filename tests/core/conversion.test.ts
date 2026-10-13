import { expect, it } from 'vitest';
import { convertComponents, validateBundle } from '../../src/core/conversion';
import { inventorySource } from '../../src/core/inventory';
import type { Diagnostics, SourceSnapshot } from '../../src/shared/contracts';
const diagnostics: Diagnostics = { authenticated: false, capabilities: { exec: false, pluginAdd: true, marketplaceAdd: true, pluginListJson: true, isolatedConversion: false }, findings: [] };
function source(files: Record<string,string>): SourceSnapshot { return {
  id: 'fixture', request: { url: 'https://github.com/acme/test.git' }, commit: 'a'.repeat(40), warnings: [],
  files: Object.entries(files).map(([path,text]) => ({ path, data: Buffer.from(text), mode: '100644', oid: '' }))
}; }
const options = { useCodex: false, diagnostics, dataRoot: 'unused-in-structural-tests' };
it('preserva recursos e licença em uma skill independente', async () => {
  const input = source({ 'SKILL.md': '---\nname: edição\ndescription: Editar vídeo\n---\nLeia references/guia.md.', 'references/guia.md': 'conteúdo fiel', 'LICENSE': 'licença original' });
  const [bundle] = await convertComponents(input, inventorySource(input).map(c => c.id), options);
  expect(bundle.files.find(f => f.path === 'skills/edicao/references/guia.md')?.data.toString()).toBe('conteúdo fiel');
  expect(bundle.files.find(f => f.path === 'LICENSE')?.data.toString()).toBe('licença original');
  expect(bundle.installable).toBe(true);
});
it('bloqueia hooks sem equivalência comprovada e recursos exclusivos', async () => {
  const input = source({ '.claude-plugin/plugin.json': '{"name":"fixture","lspServers":{"x":{}}}', 'hooks/hooks.json': '{"hooks":{"Stop":[]}}', 'skills/hello/SKILL.md': '---\nname: hello\ndescription: Saudação\n---\nDiga olá.' });
  const [bundle] = await convertComponents(input, inventorySource(input).map(c => c.id), options);
  expect(bundle.installable).toBe(false);
  expect(bundle.findings.some(f => f.code === 'unsupported-hook')).toBe(true);
  expect(bundle.findings.some(f => f.code === 'unsupported-manifest-field')).toBe(true);
});
it('preserva MCP compatível e informa credenciais externas', async () => {
  const input = source({ '.claude-plugin/plugin.json': '{"name":"remote"}', '.mcp.json': '{"mcpServers":{"docs":{"type":"http","url":"https://example.invalid/mcp"}}}', 'skills/read/SKILL.md': '---\nname: read\ndescription: Consultar docs\n---\nConsulte as ferramentas do servidor docs.' });
  const [bundle] = await convertComponents(input, inventorySource(input).map(c => c.id), options);
  const mcp = JSON.parse(bundle.files.find(f => f.path === '.mcp.json')!.data.toString());
  expect(mcp.mcpServers.docs.url).toBe('https://example.invalid/mcp');
  expect(bundle.findings.some(f => f.code === 'mcp-setup')).toBe(true);
});
it('rejeita seleção forjada e detecta colisão de arquivos', async () => {
  const input = source({ 'SKILL.md': '---\nname: one\ndescription: Teste\n---\nA.' });
  await expect(convertComponents(input, ['unknown'], options)).rejects.toThrow();
  expect(validateBundle({ files: [{ path: 'a.md', data: Buffer.from('a'), sha256: '' }, { path: 'A.md', data: Buffer.from('b'), sha256: '' }] } as any).some(f => f.severity === 'blocking')).toBe(true);
});
it('não libera instruções dependentes do Claude como conversão completa', async () => {
  const input = source({ 'SKILL.md': '---\nname: one\ndescription: Usar ferramentas\n---\nUse a ferramenta Bash e Task do Claude Code.' });
  const [bundle] = await convertComponents(input, inventorySource(input).map(c => c.id), options);
  expect(bundle.installable).toBe(false);
  expect(bundle.findings.some(f => f.code === 'semantic-needed')).toBe(true);
});
it('converte diretório de skills declarado e comandos inline', async () => {
  const input = source({
    '.claude-plugin/plugin.json': '{"name":"custom","skills":["./workflows"],"commands":{"resumir":{"content":"Resuma o texto enviado."}}}',
    'workflows/edit/SKILL.md': '---\nname: edit\ndescription: Edição\n---\nLeia references/guia.md.',
    'workflows/edit/references/guia.md': 'referência'
  });
  const [bundle] = await convertComponents(input, inventorySource(input).map(c => c.id), options);
  expect(bundle.files.find(f => f.path === 'skills/edit/references/guia.md')?.data.toString()).toBe('referência');
  expect(bundle.files.find(f => f.path === 'skills/command-resumir/SKILL.md')?.data.toString()).toContain('Resuma o texto enviado.');
  expect(bundle.installable).toBe(true);
});
