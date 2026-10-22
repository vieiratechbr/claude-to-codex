import {it,expect} from 'vitest';
import {convertComponents} from '../../src/core/conversion';
import {inventorySource} from '../../src/core/inventory';
import {selectSemanticContext} from '../../src/core/semantic-context';
import type {SourceSnapshot} from '../../src/shared/contracts';
const options={dataRoot:'unused',useCodex:false,diagnostics:{authenticated:false,capabilities:{exec:false,pluginAdd:true,pluginListJson:true,marketplaceAdd:true,isolatedConversion:false},findings:[]}};
it('preserva especificações declaradas no catálogo YAML e suas dependências transitivas',async()=>{
 const snapshot:SourceSnapshot={id:'catalog-specs',request:{url:'https://github.com/acme/studio'},commit:'a'.repeat(40),warnings:[],files:Object.entries({
  '.claude/skills/check/SKILL.md':'Read `Test Framework/catalog.yaml` and evaluate the declared specs.',
  'Test Framework/catalog.yaml':'version: 2\nskills:\n  - name: check\n    spec: Test Framework/specs/check.md\nagents:\n  - name: reviewer\n    spec: ""\n',
  'Test Framework/specs/check.md':'Before a verdict, read [rubric](rubric.md).',
  'Test Framework/specs/rubric.md':'Require evidence for each criterion.'
 }).map(([path,text])=>({path,data:Buffer.from(text),mode:'100644',oid:''}))};
 const [bundle]=await convertComponents(snapshot,[inventorySource(snapshot)[0].id],options);
 expect(bundle.installable,JSON.stringify(bundle.findings)).toBe(true);
 expect(bundle.files.find(f=>f.sourcePath==='Test Framework/specs/check.md')?.data.toString()).toContain('Before a verdict');
 expect(bundle.files.some(f=>f.sourcePath==='Test Framework/specs/rubric.md')).toBe(true);
 expect(bundle.files.find(f=>f.path==='skills/check/references/source-context-map.md')?.data.toString()).toContain('Test Framework/specs/check.md');
});
it('não inventa especificação declarada em catálogo nem ignora seu escape de caminho',async()=>{
 for(const spec of ['Test Framework/specs/missing.md','../../outside.md']){
  const snapshot:SourceSnapshot={id:'missing-catalog-spec',request:{url:'https://github.com/acme/studio'},commit:'a'.repeat(40),warnings:[],files:Object.entries({
   '.claude/skills/check/SKILL.md':'Read `Test Framework/catalog.yaml`.',
   'Test Framework/catalog.yaml':'skills:\n  - name: check\n    spec: '+spec+'\n'
  }).map(([path,text])=>({path,data:Buffer.from(text),mode:'100644',oid:''}))};
  const [bundle]=await convertComponents(snapshot,[inventorySource(snapshot)[0].id],options);
  expect(bundle.installable).toBe(false);
  expect(bundle.findings.some(f=>f.severity==='blocking'&&['source-context-missing','invalid-source-context'].includes(f.code))).toBe(true);
 }
});
it('registra o par catálogo e valor spec relativo sem depender do cwd do projeto',async()=>{
 const snapshot:SourceSnapshot={id:'relative-catalog-spec',request:{url:'https://github.com/acme/studio'},commit:'a'.repeat(40),warnings:[],files:Object.entries({
  '.claude/skills/check/SKILL.md':'Read `Test Framework/catalog.yaml`.',
  'Test Framework/catalog.yaml':'skills:\n  - name: check\n    spec: specs/check.md\n',
  'Test Framework/specs/check.md':'Inspect each criterion.'
 }).map(([path,text])=>({path,data:Buffer.from(text),mode:'100644',oid:''}))};
 const [bundle]=await convertComponents(snapshot,[inventorySource(snapshot)[0].id],options);
 expect(bundle.installable,JSON.stringify(bundle.findings)).toBe(true);
 const map=bundle.files.find(f=>f.path==='skills/check/references/source-context-map.md')!.data.toString();
 expect(map).toContain('| `Test Framework/catalog.yaml` | `specs/check.md` |');
 expect(map).toContain('source-context/Test%20Framework/specs/check.md');
});
it('resolve destino Markdown angular com espaços sem inventar caminho truncado',async()=>{
 const snapshot:SourceSnapshot={id:'angular-spaces',request:{url:'https://github.com/acme/studio'},commit:'a'.repeat(40),warnings:[],files:Object.entries({
  '.claude/skills/review/SKILL.md':'Read [rubric](<../../../Quality Rules/review rubric.md>) before a verdict.',
  'Quality Rules/review rubric.md':'Preserve evidence for each criterion.'
 }).map(([path,text])=>({path,data:Buffer.from(text),mode:'100644',oid:''}))};
 const [bundle]=await convertComponents(snapshot,[inventorySource(snapshot)[0].id],options);
 expect(bundle.installable,JSON.stringify(bundle.findings)).toBe(true);
 expect(bundle.findings.some(f=>f.code==='source-context-missing')).toBe(false);
 expect(bundle.files.some(f=>f.sourcePath==='Quality Rules/review rubric.md')).toBe(true);
});
it('não trata padrões escapados dentro de scripts como caminhos literais ausentes',async()=>{
  const snapshot:SourceSnapshot={id:'script-pattern',request:{url:'https://github.com/acme/studio'},commit:'a'.repeat(40),warnings:[],files:Object.entries({
    '.claude/skills/probe/SKILL.md':'Read `.claude/hooks/probe.sh`.',
    '.claude/hooks/probe.sh':'#!/bin/bash\n# Match source strings, not a dependency:\npattern="${CLAUDE_SKILL_DIR}/\\.exe"\n# gsub(/[Gg][Ii][Tt](\\.exe)?/, "git", s)\n'
  }).map(([path,text])=>({path,data:Buffer.from(text),mode:'100644',oid:''}))};
  const [bundle]=await convertComponents(snapshot,[inventorySource(snapshot)[0].id],options);
  expect(bundle.findings.filter(f=>f.code==='invalid-source-context')).toEqual([]);
});
it('ignora sintaxe semelhante a links em blocos de código sem perder links obrigatórios',async()=>{
  const snapshot:SourceSnapshot={id:'fenced-example-links',request:{url:'https://github.com/acme/studio'},commit:'a'.repeat(40),warnings:[],files:Object.entries({
    '.claude/skills/check/SKILL.md':'Read `.claude/docs/examples.md`.',
    '.claude/docs/examples.md':'```csharp\nvar result = subject.[Method]([args]);\nvar sample = [example](absent.md);\n```\n\n~~~gdscript\nvar result = subject.[method]([args])\n~~~\n\nBefore writing, read [permissions](permissions.md).',
    '.claude/docs/permissions.md':'Only write with explicit consent.'
  }).map(([path,text])=>({path,data:Buffer.from(text),mode:'100644',oid:''}))};
  const [bundle]=await convertComponents(snapshot,[inventorySource(snapshot)[0].id],options);
  expect(bundle.findings.filter(f=>f.code==='source-context-missing')).toEqual([]);
  expect(bundle.files.some(f=>f.sourcePath==='.claude/docs/permissions.md')).toBe(true);
  expect(bundle.installable,JSON.stringify(bundle.findings)).toBe(true);
});
it('preserva dependências compartilhadas como recursos inativos com mapa de caminhos',async()=>{
  const originals={
    '.claude/skills/design/SKILL.md':'---\nname: design\ndescription: Project workflow\n---\n!`bash "${CLAUDE_SKILL_DIR}/../../hooks/yaml-helper.sh" resolve_config`\nRead `.claude/docs/config-resolution.md`. Consult `systems-designer` for the system.',
    '.claude/hooks/yaml-helper.sh':'#!/bin/sh\nprintf "fixture, not executed"\n',
    '.claude/docs/config-resolution.md':'Read `.claude/docs/automation-modes.md` before changing modes.',
    '.claude/docs/automation-modes.md':'Ask before destructive writes.',
    '.claude/agents/systems-designer.md':'---\nname: systems-designer\ndescription: Inspect system formulas\n---\nInspect formulas before proposing.',
    '.claude/agents/unrelated.md':'Not selected.',
    '.claude/settings.json':'{"hooks":{"SessionStart":["evil"]}}'
  };
  const snapshot:SourceSnapshot={id:'context',request:{url:'https://github.com/acme/studio'},commit:'a'.repeat(40),warnings:[],files:Object.entries(originals).map(([path,text])=>({path,data:Buffer.from(text),mode:'100644',oid:''}))};
  const [bundle]=await convertComponents(snapshot,[inventorySource(snapshot)[0].id],options);
  for(const path of ['.claude/hooks/yaml-helper.sh','.claude/docs/config-resolution.md','.claude/docs/automation-modes.md','.claude/agents/systems-designer.md']){
    expect(bundle.files.find(f=>f.path==='source-context/'+path)?.sourcePath).toBe(path);
  }
  expect(bundle.files.find(f=>f.path.endsWith('/yaml-helper.sh'))?.data.toString()).toContain('printf "fixture, not executed"');
  expect(bundle.files.find(f=>f.path.endsWith('/automation-modes.md'))?.data.toString()).toBe('Ask before destructive writes.');
  expect(bundle.files.some(f=>/settings\.json|unrelated\.md/.test(f.path))).toBe(false);
  const skill=bundle.files.find(f=>f.path==='skills/design/SKILL.md')!;
  const context=selectSemanticContext({path:skill.path,content:skill.data.toString()},bundle.files,[skill.path]);
  expect(context.files.map(f=>f.path)).toContain('source-context/.claude/hooks/yaml-helper.sh');
  expect(context.files.map(f=>f.path)).toContain('source-context/.claude/agents/systems-designer.md');
  expect(bundle.files.some(f=>f.path==='hooks/hooks.json'||f.path==='.claude/settings.json')).toBe(false);
});
it('fecha dependências estáticas de helpers irmãos antes de adaptar e registrar scripts',async()=>{
  const snapshot:SourceSnapshot={id:'sibling-script-closure',request:{url:'https://github.com/acme/studio'},commit:'a'.repeat(40),warnings:[],files:Object.entries({
    '.claude/skills/check/SKILL.md':'Read `.claude/scripts/check.sh` before checking the project.',
    '.claude/scripts/check.sh':'#!/bin/bash\nHERE="$(cd "$(dirname "$0")" && pwd)"\ncd "$HERE/../.."\nbash "$HERE/project-state.sh" --root .\n',
    '.claude/scripts/project-state.sh':'#!/bin/bash\nHERE="$(cd "$(dirname "$0")" && pwd)"\ncd "$HERE/../.."\n[ -f "${HERE}/yaml-get.awk" ] || exit 1\nawk -f "${HERE}/yaml-get.awk" project.yaml\n',
    '.claude/scripts/yaml-get.awk':'{ print $0 }\n',
    '.claude/scripts/unrelated.sh':'Do not include unrelated scripts.\n',
  }).map(([path,text])=>({path,data:Buffer.from(text),mode:'100644',oid:''}))};
  const [bundle]=await convertComponents(snapshot,[inventorySource(snapshot)[0].id],options);
  expect(bundle.files.find(file=>file.path==='source-context/.claude/scripts/yaml-get.awk')?.data.toString()).toBe('{ print $0 }\n');
  const registered=JSON.parse(bundle.files.find(file=>file.path==='codex-compat/scripts.json')!.data.toString());
  expect(Object.keys(registered).sort()).toEqual(['source-context/.claude/scripts/check.sh','source-context/.claude/scripts/project-state.sh']);
  expect(bundle.files.some(file=>file.sourcePath==='.claude/scripts/unrelated.sh')).toBe(false);
  expect(bundle.findings.filter(finding=>finding.code==='source-script-location')).toEqual([]);
  expect(bundle.installable,JSON.stringify(bundle.findings)).toBe(true);
});
it('bloqueia um recurso estático obrigatório ausente referenciado pela âncora do helper',async()=>{
  const snapshot:SourceSnapshot={id:'missing-sibling-script',request:{url:'https://github.com/acme/studio'},commit:'a'.repeat(40),warnings:[],files:Object.entries({
    '.claude/skills/check/SKILL.md':'Read `.claude/scripts/check.sh`.',
    '.claude/scripts/check.sh':'#!/bin/bash\nHERE="$(cd "$(dirname "$0")" && pwd)"\ncd "$HERE/../.."\nawk -f "$HERE/missing.awk" project.yaml\n',
  }).map(([path,text])=>({path,data:Buffer.from(text),mode:'100644',oid:''}))};
  const [bundle]=await convertComponents(snapshot,[inventorySource(snapshot)[0].id],options);
  expect(bundle.findings.some(finding=>finding.code==='source-context-missing'&&finding.severity==='blocking'&&finding.message.includes('.claude/scripts/missing.awk'))).toBe(true);
  expect(bundle.files.some(file=>file.path.endsWith('/missing.awk'))).toBe(false);
  expect(bundle.installable).toBe(false);
});
it('não bloqueia uma skill portável pelo mapa de recursos gerado',async()=>{
  const snapshot:SourceSnapshot={id:'generated-map',request:{url:'https://github.com/acme/studio'},commit:'a'.repeat(40),warnings:[],files:[{path:'.claude/skills/design/SKILL.md',data:Buffer.from('Consult `reviewer` for advice.'),mode:'100644',oid:''},{path:'.claude/agents/reviewer.md',data:Buffer.from('---\nname: reviewer\ndescription: Inspect design evidence\n---\nInspect the design.'),mode:'100644',oid:''}]};
  const [bundle]=await convertComponents(snapshot,[inventorySource(snapshot)[0].id],options);
  expect(bundle.installable,JSON.stringify(bundle.findings)).toBe(true);
});
it('não cria dependências fictícias nem copia componentes ativos não selecionados',async()=>{
  const snapshot:SourceSnapshot={id:'missing-context',request:{url:'https://github.com/acme/studio'},commit:'a'.repeat(40),warnings:[],files:[{path:'.claude/skills/design/SKILL.md',data:Buffer.from('Read `.claude/docs/absent.md` and `.claude/skills/other/SKILL.md`.'),mode:'100644',oid:''},{path:'.claude/skills/other/SKILL.md',data:Buffer.from('Other workflow'),mode:'100644',oid:''}]};
  const selected=inventorySource(snapshot).find(c=>c.name==='design')!;
  const [bundle]=await convertComponents(snapshot,[selected.id],options);
  expect(bundle.files.some(f=>f.path.includes('absent.md')||f.path.includes('/other/'))).toBe(false);
  expect(bundle.findings.some(f=>f.code==='source-context-missing'&&f.file==='skills/design/SKILL.md')).toBe(true);
  expect(bundle.installable).toBe(false);
});
it('inclui helpers dos documentos de apoio e adapta a raiz do projeto explicitamente',async()=>{
  const snapshot:SourceSnapshot={id:'helpers',request:{url:'https://github.com/acme/studio'},commit:'a'.repeat(40),warnings:[],files:Object.entries({
    '.claude/skills/design/SKILL.md':'Read [the contract](CONTRACT.md).',
    '.claude/skills/design/CONTRACT.md':'Run `.claude/scripts/godot-parse-check.gd` then `.claude/scripts/story-status.sh`.',
    '.claude/scripts/godot-parse-check.gd':'extends SceneTree\n# Artificial parser fixture.',
    '.claude/scripts/story-status.sh':'#!/bin/bash\ncd "$(dirname "$0")/../.."\ncat production/stories.md',
  }).map(([path,text])=>({path,data:Buffer.from(text),mode:'100644',oid:''}))};
  const [bundle]=await convertComponents(snapshot,[inventorySource(snapshot)[0].id],options);
  expect(bundle.files.some(f=>f.path==='source-context/.claude/scripts/godot-parse-check.gd')).toBe(true);
  expect(bundle.installable,JSON.stringify(bundle.findings)).toBe(true);
  expect(bundle.files.find(f=>f.path.endsWith('/story-status.sh'))?.data.toString()).toContain('cd "$C2C_PROJECT_ROOT"');
  expect(bundle.findings.some(f=>f.code==='project-script-adapted'&&f.severity==='warning')).toBe(true);
});
it('resolve especialistas no contexto do plugin selecionado sem misturar papéis homônimos',async()=>{
  const snapshot:SourceSnapshot={id:'scoped-roles',request:{url:'https://github.com/acme/studio'},commit:'a'.repeat(40),warnings:[],files:Object.entries({
    'plugins/one/.claude/skills/design/SKILL.md':'Consult `reviewer` before proposing.',
    'plugins/one/.claude/agents/reviewer.md':'Role for one.',
    'plugins/other/.claude/agents/reviewer.md':'Unrelated private role.'
  }).map(([path,text])=>({path,data:Buffer.from(text),mode:'100644',oid:''}))};
  const [bundle]=await convertComponents(snapshot,[inventorySource(snapshot)[0].id],options);
  expect(bundle.files.find(f=>f.path==='source-context/plugins/one/.claude/agents/reviewer.md')?.data.toString()).toBe('Role for one.');
  expect(bundle.files.some(f=>f.path.includes('plugins/other'))).toBe(false);
});
it('encontra o contexto do plugin proprietário no layout padrão skills/',async()=>{
  const snapshot:SourceSnapshot={id:'standard-plugin-context',request:{url:'https://github.com/acme/studio'},commit:'a'.repeat(40),warnings:[],files:Object.entries({
    'plugins/one/.claude-plugin/plugin.json':'{"name":"one"}',
    'plugins/one/skills/design/SKILL.md':'Consult `reviewer` before proposing.',
    'plugins/one/.claude/agents/reviewer.md':'Required role for one.',
    'plugins/other/.claude/agents/reviewer.md':'Unrelated role.'
  }).map(([path,text])=>({path,data:Buffer.from(text),mode:'100644',oid:''}))};
  const skill=inventorySource(snapshot).find(c=>c.kind==='skill')!;
  const [bundle]=await convertComponents(snapshot,[skill.id],options);
  expect(bundle.files.find(f=>f.path==='source-context/plugins/one/.claude/agents/reviewer.md')?.data.toString()).toBe('Required role for one.');
  expect(bundle.files.some(f=>f.path.includes('plugins/other'))).toBe(false);
});
it('bloqueia dependência transitiva obrigatória e mantém exemplos opcionais como avisos',async()=>{
  const snapshot:SourceSnapshot={id:'mandatory-context',request:{url:'https://github.com/acme/studio'},commit:'a'.repeat(40),warnings:[],files:Object.entries({
    '.claude/skills/design/SKILL.md':'Read `.claude/docs/main.md`.',
    '.claude/docs/main.md':'Read `.claude/docs/permissions.md` before any writes; do not proceed without it.\nOptional example: `.claude/docs/example.md`.'
  }).map(([path,text])=>({path,data:Buffer.from(text),mode:'100644',oid:''}))};
  const [bundle]=await convertComponents(snapshot,[inventorySource(snapshot)[0].id],options);
  expect(bundle.installable).toBe(false);
  expect(bundle.findings.find(f=>f.code==='source-context-missing'&&f.message.includes('permissions.md'))?.severity).toBe('blocking');
  expect(bundle.findings.find(f=>f.code==='source-context-missing'&&f.message.includes('example.md'))?.severity).toBe('warning');
});
it('reconhece diretório de trabalho da origem sem tratá-lo como arquivo a incluir',async()=>{
  const snapshot:SourceSnapshot={id:'project-directory',request:{url:'https://github.com/acme/studio'},commit:'a'.repeat(40),warnings:[],files:[{path:'.claude/skills/settings/SKILL.md',data:Buffer.from('(cd "${CLAUDE_SKILL_DIR}/../../.." && read-project-config)'),mode:'100644',oid:''}]};
  const [bundle]=await convertComponents(snapshot,[inventorySource(snapshot)[0].id],options);
  expect(bundle.findings.some(f=>f.code==='invalid-source-context'||f.code==='source-context-missing')).toBe(false);
  expect(bundle.files.find(f=>f.path==='skills/settings/SKILL.md')?.data.toString()).toContain('${C2C_PROJECT_ROOT}');
});
it('permite procurar um template opcional com fallback sem fabricar o arquivo ausente',async()=>{
  const snapshot:SourceSnapshot={id:'optional-template',request:{url:'https://github.com/acme/studio'},commit:'a'.repeat(40),warnings:[],files:[{path:'.claude/skills/notes/SKILL.md',data:Buffer.from('## Template detection\n\n1. Glob for `.claude/docs/templates/notes.md`.\n2. If found, read it.\n3. If not found, use the built-in structure below.\n\n## Output\n\nWrite a short report.'),mode:'100644',oid:''}]};
  const [bundle]=await convertComponents(snapshot,[inventorySource(snapshot)[0].id],options);
  expect(bundle.installable,JSON.stringify(bundle.findings)).toBe(true);
  expect(bundle.files.some(f=>f.path.endsWith('/templates/notes.md'))).toBe(false);
});
it('preserva dependências relativas obrigatórias dos documentos compartilhados',async()=>{
  const snapshot:SourceSnapshot={id:'relative-shared',request:{url:'https://github.com/acme/studio'},commit:'a'.repeat(40),warnings:[],files:Object.entries({
    '.claude/skills/design/SKILL.md':'Read `.claude/docs/main.md`.',
    '.claude/docs/main.md':'Before writing, read [permissions](permissions.md).',
    '.claude/docs/permissions.md':'Only write after explicit consent.',
  }).map(([path,text])=>({path,data:Buffer.from(text),mode:'100644',oid:''}))};
  const [bundle]=await convertComponents(snapshot,[inventorySource(snapshot)[0].id],options);
  expect(bundle.files.find(f=>f.path==='source-context/.claude/docs/permissions.md')?.data.toString()).toBe('Only write after explicit consent.');
  expect(bundle.installable,JSON.stringify(bundle.findings)).toBe(true);
});
it('preserva papéis nomeados fora de crases quando pertencem ao plugin selecionado',async()=>{
  const snapshot:SourceSnapshot={id:'plain-role',request:{url:'https://github.com/acme/studio'},commit:'a'.repeat(40),warnings:[],files:Object.entries({
    '.claude/skills/design/SKILL.md':'Consult systems-designer before drafting the formulas.',
    '.claude/agents/systems-designer.md':'Inspect formula units and bounds.',
  }).map(([path,text])=>({path,data:Buffer.from(text),mode:'100644',oid:''}))};
  const [bundle]=await convertComponents(snapshot,[inventorySource(snapshot)[0].id],options);
  expect(bundle.files.find(f=>f.path==='source-context/.claude/agents/systems-designer.md')?.data.toString()).toBe('Inspect formula units and bounds.');
});
it('inclui recursos operacionais com espaços no caminho e instruções raiz referenciadas',async()=>{
  const snapshot:SourceSnapshot={id:'framework-resources',request:{url:'https://github.com/acme/studio'},commit:'a'.repeat(40),warnings:[],files:Object.entries({
    '.claude/skills/test/SKILL.md':'Read `CCGS Skill Testing Framework/quality-rubric.md` and `CLAUDE.md` before testing.',
    'CCGS Skill Testing Framework/quality-rubric.md':'Keep evidence for each verdict.',
    'CLAUDE.md':'Read `.claude/docs/coordination.md` before project work.',
    '.claude/docs/coordination.md':'Preserve role boundaries.',
  }).map(([path,text])=>({path,data:Buffer.from(text),mode:'100644',oid:''}))};
  const [bundle]=await convertComponents(snapshot,[inventorySource(snapshot)[0].id],options);
  for(const path of ['CCGS Skill Testing Framework/quality-rubric.md','CLAUDE.md','.claude/docs/coordination.md'])expect(bundle.files.some(f=>f.sourcePath===path),path).toBe(true);
});
it('resolve o link do mapa instalado para o recurso cujo nome contém espaços',async()=>{
  const snapshot:SourceSnapshot={id:'encoded-resource-map',request:{url:'https://github.com/acme/studio'},commit:'a'.repeat(40),warnings:[],files:Object.entries({
    '.claude/skills/quality/SKILL.md':'Read `Quality Rules/review rubric.md` before producing a verdict.',
    'Quality Rules/review rubric.md':'A verdict needs inspected evidence.',
  }).map(([path,text])=>({path,data:Buffer.from(text),mode:'100644',oid:''}))};
  const [bundle]=await convertComponents(snapshot,[inventorySource(snapshot)[0].id],options);
  const map=bundle.files.find(file=>file.path==='skills/quality/references/source-context-map.md')!;
  const destination=/\[abrir\]\(([^)]+)\)/.exec(map.data.toString())?.[1];
  expect(destination).toBeDefined();
  expect(destination).not.toMatch(/\s/);
  const target=decodeURIComponent(new URL(destination!,'https://bundle.invalid/'+map.path).pathname.slice(1));
  expect(bundle.files.find(file=>file.path===target)?.data.toString()).toBe('A verdict needs inspected evidence.');
  expect(bundle.installable,JSON.stringify(bundle.findings)).toBe(true);
});
it('mantém o link de licença do README compartilhado apontando para a cópia legal preservada',async()=>{
  const snapshot:SourceSnapshot={id:'shared-readme-license',request:{url:'https://github.com/acme/studio'},commit:'a'.repeat(40),warnings:[],files:Object.entries({
    '.claude/skills/quality/SKILL.md':'Read `README.md` before reviewing the project.',
    'README.md':'Project conventions. See [LICENSE](LICENSE) for redistribution terms.',
    'LICENSE':'Fixture redistribution terms.',
  }).map(([path,text])=>({path,data:Buffer.from(text),mode:'100644',oid:''}))};
  const [bundle]=await convertComponents(snapshot,[inventorySource(snapshot)[0].id],options);
  const readme=bundle.files.find(file=>file.sourcePath==='README.md')!;
  const destination=/\[LICENSE\]\(([^)]+)\)/.exec(readme.data.toString())?.[1];
  expect(destination).toBeDefined();
  const target=decodeURIComponent(new URL(destination!,'https://bundle.invalid/'+readme.path).pathname.slice(1));
  expect(bundle.files.find(file=>file.path===target)?.data.toString()).toBe('Fixture redistribution terms.');
  expect(bundle.files.some(file=>file.path==='source-context/LICENSE')).toBe(false);
  expect(bundle.installable,JSON.stringify(bundle.findings)).toBe(true);
});
