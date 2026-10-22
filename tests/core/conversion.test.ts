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
  const [bundle] = await convertComponents(input, inventorySource(input).filter(c => !c.parentPluginId).map(c => c.id), options);
  expect(bundle.files.find(f => f.path === 'skills/edicao/references/guia.md')?.data.toString()).toBe('conteúdo fiel');
  expect(bundle.files.find(f => f.path === 'LICENSE')?.data.toString()).toBe('licença original');
  expect(bundle.installable).toBe(true);
});
it('bloqueia hooks sem equivalência comprovada e recursos exclusivos', async () => {
  const input = source({ '.claude-plugin/plugin.json': '{"name":"fixture","lspServers":{"x":{}}}', 'hooks/hooks.json': '{"hooks":{"Stop":[]}}', 'skills/hello/SKILL.md': '---\nname: hello\ndescription: Saudação\n---\nDiga olá.' });
  const [bundle] = await convertComponents(input, inventorySource(input).filter(c => !c.parentPluginId).map(c => c.id), options);
  expect(bundle.installable).toBe(false);
  expect(bundle.findings.some(f => f.code === 'unsupported-hook')).toBe(true);
  expect(bundle.findings.some(f => f.code === 'unsupported-manifest-field')).toBe(true);
});
it('preserva MCP compatível e informa credenciais externas', async () => {
  const input = source({ '.claude-plugin/plugin.json': '{"name":"remote"}', '.mcp.json': '{"mcpServers":{"docs":{"type":"http","url":"https://example.invalid/mcp"}}}', 'skills/read/SKILL.md': '---\nname: read\ndescription: Consultar docs\n---\nConsulte as ferramentas do servidor docs.' });
  const [bundle] = await convertComponents(input, inventorySource(input).filter(c => !c.parentPluginId).map(c => c.id), options);
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
  const [bundle] = await convertComponents(input, inventorySource(input).filter(c => !c.parentPluginId).map(c => c.id), options);
  expect(bundle.installable).toBe(false);
  expect(bundle.findings.some(f => f.code === 'semantic-needed')).toBe(true);
});
it('converte diretório de skills declarado e comandos inline', async () => {
  const input = source({
    '.claude-plugin/plugin.json': '{"name":"custom","skills":["./workflows"],"commands":{"resumir":{"content":"Resuma o texto enviado."}}}',
    'workflows/edit/SKILL.md': '---\nname: edit\ndescription: Edição\n---\nLeia references/guia.md.',
    'workflows/edit/references/guia.md': 'referência'
  });
  const [bundle] = await convertComponents(input, inventorySource(input).filter(c => !c.parentPluginId).map(c => c.id), options);
  expect(bundle.files.find(f => f.path === 'skills/edit/references/guia.md')?.data.toString()).toBe('referência');
  expect(bundle.files.find(f => f.path === 'skills/command-resumir/SKILL.md')?.data.toString()).toContain('Resuma o texto enviado.');
  expect(bundle.installable).toBe(true);
});
it('bloqueia duas origens que convergem ao mesmo destino', async () => {
  const input = source({ '.claude-plugin/plugin.json': '{"name":"collision","skills":"./workflows"}', 'skills/hello/SKILL.md': 'First', 'workflows/hello/SKILL.md': 'Second' });
  const [bundle] = await convertComponents(input, inventorySource(input).filter(c => !c.parentPluginId).map(c => c.id), options);
  expect(bundle.installable).toBe(false); expect(bundle.findings.some(f => f.code === 'duplicate-destination')).toBe(true);
});
it('bloqueia hooks e campos funcionais de frontmatter em vez de descartá-los', async () => {
  const input = source({ 'SKILL.md': '---\nname: guarded\ndescription: Guarded\nhooks:\n  PreToolUse:\n    - matcher: "*"\n      hooks: [{type: command, command: validate}]\n---\nDo work.' });
  const [bundle] = await convertComponents(input, inventorySource(input).filter(c => !c.parentPluginId).map(c => c.id), options);
  expect(bundle.installable).toBe(false); expect(bundle.findings.some(f => f.code === 'source-policy')).toBe(true);
});
it('preserva referência compartilhada e avisos ancestrais, e bloqueia referência ausente', async () => {
  const input = source({ 'skills/hello/SKILL.md': '---\nname: hello\ndescription: Shared\n---\nRead [guide](../../shared/guide.md).', 'shared/guide.md': 'Reference', 'NOTICE': 'Attribution' });
  const [bundle] = await convertComponents(input, [inventorySource(input)[0].id], options);
  expect(bundle.files.find(f => f.path === 'shared/guide.md')?.data.toString()).toBe('Reference');
  expect(bundle.files.find(f => f.path === 'NOTICE')?.data.toString()).toBe('Attribution'); expect(bundle.installable).toBe(true);
  const missing = source({ 'SKILL.md': 'Read [missing](references/missing.md).' });
  const [blocked] = await convertComponents(missing, inventorySource(missing).filter(c => !c.parentPluginId).map(c => c.id), options);
  expect(blocked.installable).toBe(false); expect(blocked.findings.some(f => f.code === 'missing-reference')).toBe(true);
});
it('bloqueia skills explicitamente declaradas e ausentes', async () => {
  const input = source({ '.claude-plugin/plugin.json': '{"name":"partial","skills":["./missing"]}', 'skills/hello/SKILL.md': 'Present' });
  const [bundle] = await convertComponents(input, inventorySource(input).filter(c => !c.parentPluginId).map(c => c.id), options);
  expect(bundle.installable).toBe(false); expect(bundle.findings.some(f => f.code === 'missing-component-path')).toBe(true);
});
it.each(['${CLAUDE_SKILL_DIR}/references/a.md', '$1'])('não libera sintaxe específica %s sem adaptação', async token => {
  const input = source({ 'SKILL.md': '---\nname: one\ndescription: Native syntax\n---\nRead ' + token });
  const [bundle] = await convertComponents(input, inventorySource(input).filter(c => !c.parentPluginId).map(c => c.id), options); expect(bundle.installable).toBe(false);
});
it('não aplica impedimentos externos de componente não selecionado', async () => {
  const input = source({ 'skills/hello/SKILL.md': 'Hello', 'plugins/other/.claude-plugin/plugin.json': '{"name":"other"}', 'plugins/other/assets/video.mp4': 'version https://git-lfs.github.com/spec/v1\noid sha256:x' });
  input.warnings = ['Recurso externo não baixado: plugins/other/assets/video.mp4'];
  const hello = inventorySource(input).find(c => c.kind === 'skill')!;
  const [bundle] = await convertComponents(input, [hello.id], options); expect(bundle.installable).toBe(true);
});
it('remapeia referência compartilhada de plugin aninhado sem perder a origem', async () => {
  const input = source({ 'plugins/one/.claude-plugin/plugin.json': '{"name":"one"}', 'plugins/one/skills/hello/SKILL.md': 'Read [guide](../../shared/guide.md).', 'plugins/one/shared/guide.md': 'Nested reference' });
  const [bundle] = await convertComponents(input, inventorySource(input).filter(c => !c.parentPluginId).map(c => c.id), options);
  expect(bundle.installable).toBe(true);
  expect(bundle.files.find(f => f.path.endsWith('/SKILL.md'))?.data.toString()).toContain('../../shared/guide.md');
});
it('preserva servidor MCP cujo nome coincide com propriedade de Object', async () => {
  const input = source({ '.claude-plugin/plugin.json': '{"name":"mcp"}', '.mcp.json': '{"mcpServers":{"__proto__":{"type":"http","url":"https://example.invalid/mcp"}}}', 'skills/hello/SKILL.md': 'Hello' });
  const [bundle] = await convertComponents(input, inventorySource(input).filter(c => !c.parentPluginId).map(c => c.id), options);
  const mcp = bundle.files.find(f => f.path === '.mcp.json'); expect(mcp).toBeDefined(); expect(Object.keys(JSON.parse(mcp!.data.toString()).mcpServers)).toEqual(['__proto__']);
});
it('bloqueia variável de projeto Claude no MCP', async () => {
  const input = source({ '.claude-plugin/plugin.json': '{"name":"mcp"}', '.mcp.json': '{"mcpServers":{"test":{"command":"node","args":["${CLAUDE_PROJECT_DIR}/server.js"]}}}', 'skills/hello/SKILL.md': 'Hello' });
  const [bundle] = await convertComponents(input, inventorySource(input).filter(c => !c.parentPluginId).map(c => c.id), options); expect(bundle.installable).toBe(false); expect(bundle.findings.some(f => f.code === 'mcp-variable')).toBe(true);
});
it('resolve caminhos de scripts em referência a partir da pasta da skill', async () => {
  const input = source({
    '.claude-plugin/plugin.json': '{"name":"design","skills":"./.claude/skills"}',
    '.claude/skills/design/SKILL.md': 'Read [guide](references/guide.md).',
    '.claude/skills/design/references/guide.md': 'Use `scripts/search.py` and `references/spec.md`.',
    '.claude/skills/design/scripts/search.py': 'print("fixture search")',
    '.claude/skills/design/references/spec.md': 'Specification'
  });
  const [bundle] = await convertComponents(input, inventorySource(input).filter(c => !c.parentPluginId).map(c => c.id), options);
  expect(bundle.installable).toBe(true);
  expect(bundle.files.find(f => f.path === 'skills/design/references/guide.md')?.data.toString()).toContain('`scripts/search.py`');
});
it('não transforma caminhos de saída e padrões dinâmicos em arquivos ausentes', async () => {
  const input = source({
    'SKILL.md': 'Write project `assets/design-tokens.json`. Read `references/{action}.md`.',
    'references/create.md': 'Create tokens.', 'references/update.md': 'Update tokens.'
  });
  const [bundle] = await convertComponents(input, inventorySource(input).filter(c => !c.parentPluginId).map(c => c.id), options);
  expect(bundle.installable).toBe(true);
  expect(bundle.findings.some(f => f.severity === 'warning')).toBe(true);
  expect(bundle.files.some(f => f.path.endsWith('references/update.md'))).toBe(true);
});
it('não usa documentação inativa do repositório para bloquear a skill', async () => {
  const input = source({ '.claude-plugin/plugin.json': '{"name":"design"}', 'skills/design/SKILL.md': 'Give design advice.', 'README.md': 'Example: `scripts/nonexistent.py`.' });
  const [bundle] = await convertComponents(input, inventorySource(input).filter(c => !c.parentPluginId).map(c => c.id), options);
  expect(bundle.installable).toBe(true);
});
it('bloqueia um asset obrigatório ausente sem contrato de arquivo do projeto', async () => {
  const input = source({ 'SKILL.md': 'Read required template `assets/report.docx`.' });
  const [bundle] = await convertComponents(input, inventorySource(input).filter(c => !c.parentPluginId).map(c => c.id), options);
  expect(bundle.installable).toBe(false);
  expect(bundle.findings.some(f => f.code === 'missing-reference')).toBe(true);
});
it('distingue buscas de conteúdo do jogo de recursos distribuídos na skill',async()=>{
  const input=source({'SKILL.md':'Scan the game project.\n- Glob `assets/**/*.tscn`, `assets/**/*.unity`, `assets/**/*.umap` to count implemented scenes.\n- Glob `assets/**/*.dialogue`, `assets/**/*.csv`, `assets/**/*.ink`.\nIf required project inputs are absent, report NOT ASSESSED.'});
  const [bundle]=await convertComponents(input,[inventorySource(input)[0].id],options);
  expect(bundle.installable,JSON.stringify(bundle.findings)).toBe(true);
  expect(bundle.files.some(f=>f.path.includes('assets/'))).toBe(false);
  expect(bundle.findings.filter(f=>f.code==='project-file-reference')).toHaveLength(6);
});
it('reconhece tabela de tradução de projeto e exemplos de saída sem ignorar assets obrigatórios',async()=>{
  const input=source({'SKILL.md':'Ask: "May I write these new entries to `assets/data/strings/strings-en.json`?"\nRead `assets/data/strings/strings-en.json` — the source string table.\nAll values must live in `assets/data/[appropriate-file].json`, not hardcoded.\nRead required bundled template `assets/report.docx`.'});
  const [bundle]=await convertComponents(input,[inventorySource(input)[0].id],options);
  expect(bundle.findings.filter(f=>f.code==='missing-reference').map(f=>f.message)).toEqual(expect.arrayContaining([expect.stringContaining('assets/report.docx')]));
  expect(bundle.findings.filter(f=>f.code==='missing-reference').some(f=>/strings-en|appropriate-file/.test(f.message))).toBe(false);
});
it('herda o contrato explícito de arquivos do projeto nas referências da skill', async () => {
  const input = source({
    'SKILL.md': 'The scripts read and write project files such as `assets/design-tokens.json`. Read [guide](references/update.md).',
    'references/update.md': 'Read `assets/design-tokens.css` from the project.'
  });
  const [bundle] = await convertComponents(input, inventorySource(input).filter(c => !c.parentPluginId).map(c => c.id), options);
  expect(bundle.installable).toBe(true);
  expect(bundle.findings.some(f => f.code === 'project-file-reference' && f.file?.endsWith('update.md'))).toBe(true);
});
it('bloqueia padrões de referências sem candidatos reais', async () => {
  const input = source({ 'SKILL.md': 'Read required `references/{action}.md`; actions create and update.' });
  const [bundle] = await convertComponents(input, inventorySource(input).filter(c => !c.parentPluginId).map(c => c.id), options);
  expect(bundle.installable).toBe(false);
  expect(bundle.findings.some(f => f.code === 'missing-reference')).toBe(true);
});
it('não confunde a saída declarada com outro asset obrigatório no mesmo parágrafo', async () => {
  const input = source({ 'SKILL.md': 'Write `assets/output.json`; first read required bundled template `assets/report.docx`.' });
  const [bundle] = await convertComponents(input, inventorySource(input).filter(c => !c.parentPluginId).map(c => c.id), options);
  expect(bundle.installable).toBe(false);
});
it.each(['*.md', '?.md'])('preserva e valida recursos do padrão %s', async pattern => {
  const input = source({ 'SKILL.md': 'Read `references/' + pattern + '`.', 'references/a.md': 'A', 'references/b.md': 'B' });
  const [bundle] = await convertComponents(input, inventorySource(input).filter(c => !c.parentPluginId).map(c => c.id), options);
  expect(bundle.installable).toBe(true);
  expect(bundle.files.filter(f => /references\/[ab]\.md$/.test(f.path))).toHaveLength(2);
});
it('não confunde a linguagem de um bloco de comandos com a ferramenta Bash do Claude', async () => {
  const input = source({ 'SKILL.md': 'Run the portable script:\n```bash\npython scripts/search.py demo\n```', 'scripts/search.py': 'print("demo")' });
  const [bundle] = await convertComponents(input, inventorySource(input).filter(c => !c.parentPluginId).map(c => c.id), options);
  expect(bundle.installable).toBe(true);
  expect(bundle.files.find(f => f.path.endsWith('/SKILL.md'))?.data.toString()).toContain('```bash');
});
it('permite avisar que variáveis Claude não existem no Codex sem tratá-las como dependências', async () => {
  const input = source({ 'SKILL.md': "Read arguments from the user's request; do not assume a `$ARGUMENTS` variable exists in Codex." });
  const [bundle] = await convertComponents(input, inventorySource(input).filter(c => !c.parentPluginId).map(c => c.id), options);
  expect(bundle.installable).toBe(true);
  const unsafe = source({ 'SKILL.md': 'Do not assume a `$ARGUMENTS` variable exists; then execute `echo $ARGUMENTS`.' });
  const [blocked] = await convertComponents(unsafe, inventorySource(unsafe).filter(c => !c.parentPluginId).map(c => c.id), options);
  expect(blocked.installable).toBe(false);
});
it.each(['$ARGUMENTS'])('não ignora variáveis em comandos com texto de advertência: %s', async token => {
  for (const text of ['```sh\necho "do not assume a ' + token + ' variable exists"\n```', '`echo "do not assume a ' + token + ' variable exists"`', '``echo "do not assume a `' + token + '` variable exists"``']) {
    const input = source({ 'SKILL.md': text });
    const [bundle] = await convertComponents(input, inventorySource(input).filter(c => !c.parentPluginId).map(c => c.id), options);
    expect(bundle.installable).toBe(false);
  }
});
it('distingue o plugin completo de uma skill importada por pasta', async () => {
  const whole = source({ '.claude-plugin/plugin.json': '{"name":"design","skills":"./.claude/skills"}', '.claude/skills/design/SKILL.md': '---\nname: design\ndescription: Design\n---\nDesign advice.' });
  const scoped = source({ 'SKILL.md': '---\nname: design\ndescription: Design\n---\nDesign advice.' }); scoped.request.subdirectory = '.claude/skills/design';
  const [plugin] = await convertComponents(whole, inventorySource(whole).filter(c => !c.parentPluginId).map(c => c.id), options);
  const [skill] = await convertComponents(scoped, inventorySource(scoped).filter(c => !c.parentPluginId).map(c => c.id), options);
  expect(plugin.pluginName).not.toBe(skill.pluginName);
  const unscopedSkill = source({ '.claude/skills/design/SKILL.md': scoped.files[0].data.toString() });
  const [sameOrigin] = await convertComponents(unscopedSkill, inventorySource(unscopedSkill).filter(c => !c.parentPluginId).map(c => c.id), options);
  expect(sameOrigin.pluginName).toBe(skill.pluginName);
});
