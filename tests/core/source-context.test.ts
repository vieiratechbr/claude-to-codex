import {it,expect} from 'vitest';
import {convertComponents} from '../../src/core/conversion';
import {inventorySource} from '../../src/core/inventory';
import {selectSemanticContext} from '../../src/core/semantic-context';
import type {SourceSnapshot} from '../../src/shared/contracts';
const options={dataRoot:'unused',useCodex:false,diagnostics:{authenticated:false,capabilities:{exec:false,pluginAdd:true,pluginListJson:true,marketplaceAdd:true,isolatedConversion:false},findings:[]}};
it('preserva dependências compartilhadas como recursos inativos com mapa de caminhos',async()=>{
  const originals={
    '.claude/skills/design/SKILL.md':'---\nname: design\ndescription: Project workflow\n---\n!`bash "${CLAUDE_SKILL_DIR}/../../hooks/yaml-helper.sh" resolve_config`\nRead `.claude/docs/config-resolution.md`. Consult `systems-designer` for the system.',
    '.claude/hooks/yaml-helper.sh':'#!/bin/sh\nprintf "fixture, not executed"\n',
    '.claude/docs/config-resolution.md':'Read `.claude/docs/automation-modes.md` before changing modes.',
    '.claude/docs/automation-modes.md':'Ask before destructive writes.',
    '.claude/agents/systems-designer.md':'---\nname: systems-designer\n---\nInspect formulas before proposing.',
    '.claude/agents/unrelated.md':'Not selected.',
    '.claude/settings.json':'{"hooks":{"SessionStart":["evil"]}}'
  };
  const snapshot:SourceSnapshot={id:'context',request:{url:'https://github.com/acme/studio'},commit:'a'.repeat(40),warnings:[],files:Object.entries(originals).map(([path,text])=>({path,data:Buffer.from(text),mode:'100644',oid:''}))};
  const [bundle]=await convertComponents(snapshot,[inventorySource(snapshot)[0].id],options);
  for(const path of ['.claude/hooks/yaml-helper.sh','.claude/docs/config-resolution.md','.claude/docs/automation-modes.md','.claude/agents/systems-designer.md']){
    expect(bundle.files.find(f=>f.path==='source-context/'+path)?.data.toString()).toBe(originals[path as keyof typeof originals]);
  }
  expect(bundle.files.some(f=>/settings\.json|unrelated\.md/.test(f.path))).toBe(false);
  const skill=bundle.files.find(f=>f.path==='skills/design/SKILL.md')!;
  const context=selectSemanticContext({path:skill.path,content:skill.data.toString()},bundle.files,[skill.path]);
  expect(context.files.map(f=>f.path)).toContain('source-context/.claude/hooks/yaml-helper.sh');
  expect(context.files.map(f=>f.path)).toContain('source-context/.claude/agents/systems-designer.md');
  expect(bundle.files.some(f=>f.path==='hooks/hooks.json'||f.path==='.claude/settings.json')).toBe(false);
});
it('não bloqueia uma skill portável pelo mapa de recursos gerado',async()=>{
  const snapshot:SourceSnapshot={id:'generated-map',request:{url:'https://github.com/acme/studio'},commit:'a'.repeat(40),warnings:[],files:[{path:'.claude/skills/design/SKILL.md',data:Buffer.from('Consult `reviewer` for advice.'),mode:'100644',oid:''},{path:'.claude/agents/reviewer.md',data:Buffer.from('Inspect the design.'),mode:'100644',oid:''}]};
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
it('inclui helpers referenciados pelos documentos de apoio e bloqueia raiz derivada do cache',async()=>{
  const snapshot:SourceSnapshot={id:'helpers',request:{url:'https://github.com/acme/studio'},commit:'a'.repeat(40),warnings:[],files:Object.entries({
    '.claude/skills/design/SKILL.md':'Read [the contract](CONTRACT.md).',
    '.claude/skills/design/CONTRACT.md':'Run `.claude/scripts/godot-parse-check.gd` then `.claude/scripts/story-status.sh`.',
    '.claude/scripts/godot-parse-check.gd':'extends SceneTree\n# Artificial parser fixture.',
    '.claude/scripts/story-status.sh':'#!/bin/bash\ncd "$(dirname "$0")/../.."\ncat production/stories.md',
  }).map(([path,text])=>({path,data:Buffer.from(text),mode:'100644',oid:''}))};
  const [bundle]=await convertComponents(snapshot,[inventorySource(snapshot)[0].id],options);
  expect(bundle.files.some(f=>f.path==='source-context/.claude/scripts/godot-parse-check.gd')).toBe(true);
  expect(bundle.installable).toBe(false);
  expect(bundle.findings.some(f=>f.code==='source-script-location'&&f.severity==='blocking')).toBe(true);
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
  expect(bundle.installable).toBe(false);
});
