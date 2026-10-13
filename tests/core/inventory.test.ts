import { expect, it } from 'vitest';
import { inventorySource } from '../../src/core/inventory';
const snapshot = (files: Record<string,string>) => ({
  id: 'fixture', request: { url: 'https://github.com/acme/test.git' }, commit: 'a'.repeat(40), warnings: [],
  files: Object.entries(files).map(([path, text]) => ({ path, data: Buffer.from(text), oid: '', mode: '100644' }))
});
it('descobre skill na raiz e mantém recursos', () => {
  const items = inventorySource(snapshot({ 'SKILL.md': '---\nname: edit\ndescription: Editar\n---\nGuia.', 'references/a.md': 'apoio', 'LICENSE': 'licença' }));
  expect(items).toHaveLength(1);
  expect(items[0].files).toContain('references/a.md');
});
it('separa plugins de um marketplace', () => {
  const items = inventorySource(snapshot({
    '.claude-plugin/marketplace.json': '{"name":"fixture","plugins":[{"name":"one","source":"./plugins/one"},{"name":"two","source":"./plugins/two"}]}',
    'plugins/one/.claude-plugin/plugin.json': '{"name":"one"}',
    'plugins/one/skills/a/SKILL.md': '---\nname: a\ndescription: Primeiro\n---\nA.',
    'plugins/two/.claude-plugin/plugin.json': '{"name":"two"}',
    'plugins/two/skills/b/SKILL.md': '---\nname: b\ndescription: Segundo\n---\nB.'
  }));
  expect(items.map(i => i.name).sort()).toEqual(['one', 'two']);
  expect(items[0].files.some(p => p.includes('plugins/two'))).toBe(false);
});
it('expõe manifest malformado em vez de perder o plugin', () => {
  const items = inventorySource(snapshot({ '.claude-plugin/plugin.json': '{broken', 'skills/a/SKILL.md': 'A.' }));
  expect(items[0].findings.some(f => f.severity === 'blocking')).toBe(true);
});
it('compõe entradas locais do marketplace e expõe fontes externas bloqueadas', () => {
  const items = inventorySource(snapshot({ '.claude-plugin/marketplace.json': JSON.stringify({ name: 'fixture', plugins: [{ name: 'one', source: './plugins/one', strict: false, commands: './prompts' }, { name: 'remote', source: { source: 'github', repo: 'acme/external' } }] }), 'plugins/one/prompts/hello.md': 'Hello' }));
  expect(items.map(i => i.name)).toEqual(['one', 'remote']);
  expect(items[0].manifest?.commands).toBe('./prompts'); expect(items[0].files).toContain('plugins/one/prompts/hello.md');
  expect(items[1].findings.some(f => f.code === 'external-marketplace-source' && f.severity === 'blocking')).toBe(true);
});
it('combina componentes de entrada com manifest existente e informa conflito strict:false', () => {
  const files = { '.claude-plugin/marketplace.json': '{"name":"fixture","plugins":[{"name":"one","source":"./plugins/one","commands":"./prompts"}]}', 'plugins/one/.claude-plugin/plugin.json': '{"name":"one","skills":"./workflows"}', 'plugins/one/prompts/hello.md': 'Hello', 'plugins/one/workflows/edit/SKILL.md': 'Edit' };
  const [item] = inventorySource(snapshot(files)); expect(item.manifest?.commands).toBe('./prompts'); expect(item.manifest?.skills).toBe('./workflows');
  files['.claude-plugin/marketplace.json'] = '{"name":"fixture","plugins":[{"name":"one","source":"./plugins/one","strict":false,"commands":"./prompts"}]}';
  expect(inventorySource(snapshot(files))[0].findings.some(f => f.code === 'marketplace-manifest-conflict')).toBe(true);
});
