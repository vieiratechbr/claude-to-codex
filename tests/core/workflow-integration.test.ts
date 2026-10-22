import {expect,it,vi} from 'vitest';
import {convertComponents} from '../../src/core/conversion';
import {inventorySource} from '../../src/core/inventory';
import {adaptWithCodex} from '../../src/core/semantic';
import type {SourceSnapshot} from '../../src/shared/contracts';
vi.mock('../../src/core/semantic',()=>({adaptWithCodex:vi.fn()}));
const options={dataRoot:'unused',useCodex:false,diagnostics:{authenticated:false,capabilities:{exec:false,pluginAdd:true,pluginListJson:true,marketplaceAdd:true,isolatedConversion:false},findings:[]}};
function snapshot(entries:Record<string,string>):SourceSnapshot{return{id:'workflow',request:{url:'https://github.com/acme/workflows'},commit:'a'.repeat(40),warnings:[],files:Object.entries(entries).map(([path,text])=>({path,data:Buffer.from(text),mode:'100644',oid:''}))};}
it('mantém escrita de instruções em shell pendente de adaptação em vez de liberar escrita no cache',async()=>{
 const source=snapshot({'.claude/skills/setup/SKILL.md':"Read `CLAUDE.md` first. Then write the approved scaffold:\n```sh\ncat > CLAUDE.md <<'EOF'\n# Project rules\nEOF\n```",'CLAUDE.md':'Preserve existing conventions.'});
 const [bundle]=await convertComponents(source,[inventorySource(source)[0].id],options);
 expect(bundle.installable).toBe(false);
 expect(bundle.findings.some(f=>f.code==='workflow-project-write-review'&&f.severity==='blocking')).toBe(true);
});
it.each(["sed -i 's/old/new/' CLAUDE.md","echo ready; cp project.md CLAUDE.md","mv CLAUDE.md project.md"] )('não libera mutação de recurso preservado por um comando alternativo: %s',async command=>{
 const source=snapshot({'.claude/skills/setup/SKILL.md':'Read `CLAUDE.md` first.\n```sh\n'+command+'\n```','CLAUDE.md':'Old conventions.'});
 const [bundle]=await convertComponents(source,[inventorySource(source)[0].id],options);
 expect(bundle.installable,JSON.stringify(bundle.findings)).toBe(false);
 expect(bundle.findings.some(f=>f.code==='workflow-project-write-review')).toBe(true);
});
it('vincula restrições e preload do especialista aos recursos e nomes nativos selecionados',async()=>{
 const source=snapshot({
 '.claude/skills/design/SKILL.md':'Consult `reviewer` before approving.',
 '.claude/skills/check/SKILL.md':'Check the artifact evidence.',
 '.claude/agents/reviewer.md':'---\nname: reviewer\ndescription: Review artifact evidence\ntools: Read, Glob, Grep, Write, Edit\ndisallowedTools: Bash\nskills: [check]\nisolation: worktree\n---\nReview only the supplied evidence.'
 });
 const [bundle]=await convertComponents(source,inventorySource(source).filter(c=>c.kind==='skill').map(c=>c.id),{...options,asPackage:true});
 expect(bundle.installable,JSON.stringify(bundle.findings)).toBe(true);
 const manifest=JSON.parse(bundle.files.find(f=>f.path==='codex-compat/specialist-bindings.json')!.data.toString());
 expect(manifest.roles[0].preloads[0].nativeCall).toBe('$check');
 expect(manifest.roles[0].featureMask.shell_tool).toBe(false);
 expect(manifest.roles[0].runtimeRequirements.join('\n')).toContain('worktree add --detach');
 expect(bundle.files.find(f=>f.path==='codex-compat/runtime.md')?.data.toString()).toContain('specialists.md');
});
it('bloqueia especialista com preload inexistente em vez de perder a dependência',async()=>{
 const source=snapshot({'.claude/skills/design/SKILL.md':'Consult `reviewer` before approving.','.claude/agents/reviewer.md':'---\nname: reviewer\ndescription: Review evidence\nskills: [absent]\n---\nRead the evidence.'});
 const [bundle]=await convertComponents(source,[inventorySource(source)[0].id],options);
 expect(bundle.installable).toBe(false);
 expect(bundle.findings.some(f=>f.code==='specialist-binding-missing-preload')).toBe(true);
});
it('converte preparação, decisões e contratos compartilhados no fluxo público sem executar código',async()=>{
 const source=snapshot({
 '.claude/skills/design/SKILL.md':'!`bash "${CLAUDE_SKILL_DIR}/../../scripts/probe.sh"`\nRead [the contract](CONTRACT.md).',
 '.claude/skills/design/CONTRACT.md':'Use AskUserQuestion before any approved write. Read `.claude/docs/consent.md`.',
 '.claude/docs/consent.md':'AskUserQuestion must wait for an actual answer.',
 '.claude/scripts/probe.sh':'#!/bin/bash\ncd "$(dirname "$0")/../.."\nprintf "not executed"\n'
 });
 const [bundle]=await convertComponents(source,[inventorySource(source)[0].id],options);
 expect(bundle.installable,JSON.stringify(bundle.findings)).toBe(true);
 expect(bundle.files.find(f=>f.path==='skills/design/CONTRACT.md')?.data.toString()).toContain('actual user reply');
 expect(bundle.files.find(f=>f.path==='source-context/.claude/docs/consent.md')?.data.toString()).not.toContain('AskUserQuestion');
 expect(bundle.files.some(f=>f.path==='codex-compat/run-helper.py')).toBe(true);
 expect(bundle.files.find(f=>f.path==='skills/design/SKILL.md')?.data.toString()).toContain('--project "${C2C_PROJECT_ROOT}"');
});
it('inclui documentos operacionais pendentes na adaptação e mantém falhas restritas ao arquivo',async()=>{
 const source=snapshot({'.claude/skills/design/SKILL.md':'Read [the contract](CONTRACT.md).','.claude/skills/design/CONTRACT.md':'Use Claude Code to review.','.claude/skills/design/assets/template.md':'Use Claude Code template data.'});
 vi.mocked(adaptWithCodex).mockImplementation(async input=>{
  expect(input.files.map(f=>f.path)).toEqual(['skills/design/CONTRACT.md']);
  expect(input.activeSkillPaths).toEqual(['skills/design/SKILL.md']);
  return{files:input.files.map(f=>({...f,content:f.content.replace('Claude Code','Codex')})),findings:[]};
 });
 const [bundle]=await convertComponents(source,[inventorySource(source)[0].id],{...options,useCodex:true});
 expect(bundle.installable,JSON.stringify(bundle.findings)).toBe(true);
 expect(bundle.files.find(f=>f.path==='skills/design/CONTRACT.md')?.data.toString()).toContain('Use Codex');
 expect(bundle.files.find(f=>f.path==='skills/design/assets/template.md')?.data.toString()).toBe('Use Claude Code template data.');
});
function writableCatalogSource(){return snapshot({
 '.claude/skills/skill-test/SKILL.md':'Read `CCGS Skill Testing Framework/catalog.yaml` for the current category.\n"May I update `CCGS Skill Testing Framework/catalog.yaml`?" If yes, update the entry after approval.',
 'CCGS Skill Testing Framework/catalog.yaml':'skills: {}\n'
});}
it('bloqueia no pipeline a escrita de catálogo preservado mesmo com consentimento',async()=>{
 const source=writableCatalogSource();
 const [bundle]=await convertComponents(source,[inventorySource(source)[0].id],options);
 expect(bundle.installable,JSON.stringify(bundle.findings)).toBe(false);
 expect(bundle.findings.some(f=>f.code==='workflow-installed-resource-write-review'&&f.severity==='blocking')).toBe(true);
 expect(bundle.files.find(f=>f.path==='skills/skill-test/SKILL.md')?.data.toString()).toContain('Read `source-context/CCGS Skill Testing Framework/catalog.yaml`');
});
it.each(['unchanged-write','stale-live-read'] as const)('valida novamente a proposta semântica e bloqueia %s',async mode=>{
 const source=writableCatalogSource();
 vi.mocked(adaptWithCodex).mockImplementation(async input=>({files:input.files.map(file=>({...file,content:mode==='unchanged-write'?file.content:file.content.replace(/update `source-context\/CCGS Skill Testing Framework\/catalog.yaml`/g,'update `<project-root>/testing/catalog.yaml`')})),findings:[]}));
 const [bundle]=await convertComponents(source,[inventorySource(source)[0].id],{...options,useCodex:true});
 expect(bundle.installable,JSON.stringify(bundle.findings)).toBe(false);
 expect(bundle.findings.some(f=>f.code==='workflow-installed-resource-write-review'&&f.severity==='blocking')).toBe(true);
});
it('aceita um fork local completo do catálogo sem liberar escrita no recurso instalado',async()=>{
 const source=writableCatalogSource();
 vi.mocked(adaptWithCodex).mockImplementation(async input=>({files:input.files.map(file=>({...file,content:'Read `source-context/CCGS Skill Testing Framework/catalog.yaml` only as the immutable baseline seed. Ask: "May I create `<project-root>/testing/catalog.yaml` from this baseline?" If approved, seed that fork once; inspect and merge an existing fork without overwriting it. All later category, spec and audit reads use `<project-root>/testing/catalog.yaml`. Ask: "May I update `<project-root>/testing/catalog.yaml`?" If yes, save its exact pre-edit content and update only approved entries. Keep/revert decisions and rollback preserve the original consent and restore this same fork. Never edit installed resources.'})),findings:[]}));
 const [bundle]=await convertComponents(source,[inventorySource(source)[0].id],{...options,useCodex:true});
 expect(bundle.installable,JSON.stringify(bundle.findings)).toBe(true);
 expect(bundle.findings.some(f=>f.code==='workflow-installed-resource-write-review-adapted'&&f.severity==='warning')).toBe(true);
 expect(bundle.files.find(f=>f.path==='skills/skill-test/SKILL.md')?.data.toString()).toContain('All later category, spec and audit reads use `<project-root>/testing/catalog.yaml`');
 expect(bundle.files.find(f=>f.path==='source-context/CCGS Skill Testing Framework/catalog.yaml')?.data.toString()).toBe('skills: {}\n');
});
function linkedCatalogSource(text:string){return snapshot({'.claude/skills/link-test/SKILL.md':text,'Test/catálogo.yaml':'skills: {}\n'});}
it.each([false,true])('bloqueia escrita por link Markdown ao recurso instalado (assisted=%s)',async useCodex=>{
 const source=linkedCatalogSource('If approved, update [the catalog](../../../Test/cat%C3%A1logo.yaml) with the last result.');
 vi.mocked(adaptWithCodex).mockImplementation(async input=>({files:input.files,findings:[]}));
 const [bundle]=await convertComponents(source,[inventorySource(source)[0].id],{...options,useCodex});
 expect(bundle.installable,JSON.stringify(bundle.findings)).toBe(false);
 expect(bundle.findings.some(f=>f.code==='workflow-installed-resource-write-review'&&f.severity==='blocking')).toBe(true);
 expect(bundle.files.find(f=>f.path==='skills/link-test/SKILL.md')?.data.toString()).toContain('[the catalog](../../Test/cat%C3%A1logo.yaml)');
});
it('bloqueia leitura viva por link após mover somente a escrita para o projeto',async()=>{
 const source=linkedCatalogSource('If approved, update [the catalog](../../../Test/cat%C3%A1logo.yaml).');
 vi.mocked(adaptWithCodex).mockImplementation(async input=>({files:input.files.map(file=>({...file,content:'Read [the catalog](../../Test/cat%C3%A1logo.yaml) for the current result. If approved, update `<project-root>/testing/catalog.yaml`.'})),findings:[]}));
 const [bundle]=await convertComponents(source,[inventorySource(source)[0].id],{...options,useCodex:true});
 expect(bundle.installable,JSON.stringify(bundle.findings)).toBe(false);
 expect(bundle.findings.some(f=>f.code==='workflow-installed-resource-write-review'&&f.severity==='blocking')).toBe(true);
});
it('permite baseline por link e fork local completo sem alterar o texto do link',async()=>{
 const source=linkedCatalogSource('If approved, update [the catalog](../../../Test/cat%C3%A1logo.yaml).');
 vi.mocked(adaptWithCodex).mockImplementation(async input=>({files:input.files.map(file=>({...file,content:'Read [the catalog](../../Test/cat%C3%A1logo.yaml) only as the immutable baseline seed. Ask before creating `<project-root>/testing/catalog.yaml`, seed once if approved, and inspect an existing fork without overwriting it. All later reads and approved updates use `<project-root>/testing/catalog.yaml`. Save the fork before editing and preserve original keep/revert consent and rollback to that same fork.'})),findings:[]}));
 const [bundle]=await convertComponents(source,[inventorySource(source)[0].id],{...options,useCodex:true});
 expect(bundle.installable,JSON.stringify(bundle.findings)).toBe(true);
 expect(bundle.findings.some(f=>f.code==='workflow-installed-resource-write-review-adapted')).toBe(true);
 expect(bundle.files.find(f=>f.path==='skills/link-test/SKILL.md')?.data.toString()).toContain('[the catalog](../../Test/cat%C3%A1logo.yaml)');
});
