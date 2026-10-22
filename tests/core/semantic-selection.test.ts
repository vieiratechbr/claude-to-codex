import { expect, it, vi } from 'vitest';
import { convertComponents } from '../../src/core/conversion';
import { inventorySource } from '../../src/core/inventory';
import { adaptWithCodex } from '../../src/core/semantic';
import type { ConversionOptions, SourceSnapshot } from '../../src/shared/contracts';
vi.mock('../../src/core/semantic', () => ({ adaptWithCodex: vi.fn() }));
it('remove somente o impedimento dinâmico resolvido pela adaptação validada',async()=>{
  const input:SourceSnapshot={id:'dynamic',request:{url:'https://github.com/acme/dynamic'},commit:'a'.repeat(40),warnings:[],files:[{path:'SKILL.md',data:Buffer.from('---\nname: context\ndescription: Read current state\n---\n!`git status --short`\nUse Claude Code and the current status to plan.'),mode:'100644',oid:''}]};
  vi.mocked(adaptWithCodex).mockImplementation(async request=>({files:request.files.map(f=>({path:f.path,content:'---\nname: context\ndescription: Read current state\n---\nBefore planning, obtain the current status by running `git status --short` in the project, subject to session permissions. Read its output before planning. If unavailable, report that the current status was not checked.'})),findings:[]}));
  const [bundle]=await convertComponents(input,[inventorySource(input)[0].id],{useCodex:true,dataRoot:'unused',diagnostics:{authenticated:false,capabilities:{exec:false,pluginAdd:true,marketplaceAdd:true,pluginListJson:true,isolatedConversion:false},findings:[]}});
  expect(bundle.installable,JSON.stringify(bundle.findings)).toBe(true);
  expect(bundle.findings.some(f=>f.code==='dynamic-command'&&f.severity==='blocking')).toBe(false);
  expect(bundle.findings.some(f=>f.code==='dynamic-command-adapted'&&f.severity==='warning')).toBe(true);
  vi.mocked(adaptWithCodex).mockImplementation(async request=>({files:request.files,findings:[]}));
  const [unchanged]=await convertComponents(input,[inventorySource(input)[0].id],{useCodex:true,dataRoot:'unused',diagnostics:{authenticated:false,capabilities:{exec:false,pluginAdd:true,marketplaceAdd:true,pluginListJson:true,isolatedConversion:false},findings:[]}});
  expect(unchanged.installable).toBe(false);
});
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
  const [bundle] = await convertComponents(input, inventorySource(input).filter(c => !c.parentPluginId).map(c => c.id), { useCodex: true, dataRoot: 'unused', diagnostics: { authenticated: false, capabilities: { exec: false, pluginAdd: true, marketplaceAdd: true, pluginListJson: true, isolatedConversion: false }, findings: [] } });
  expect(bundle.installable).toBe(true);
  expect(bundle.files.find(f => f.path.startsWith('cli/'))?.data.toString()).toBe('Claude Code CLI template; keep this original copy.');
});
it('preserva SKILL.md de template dentro dos assets sem torná-lo editável',async()=>{
  const original='Claude Code template original; not an active skill.';
  const input:SourceSnapshot={id:'nested',request:{url:'https://github.com/acme/design.git'},commit:'a'.repeat(40),warnings:[],files:Object.entries({'.claude-plugin/plugin.json':'{"name":"design"}','skills/design/SKILL.md':'Use Claude Code to design.','skills/design/assets/template/SKILL.md':original}).map(([path,text])=>({path,data:Buffer.from(text),mode:'100644',oid:''}))};
  vi.mocked(adaptWithCodex).mockImplementation(async request=>({files:request.files.map(file=>({path:file.path,content:'---\nname: design\ndescription: Design\n---\nUse portable design guidance.'})),findings:[]}));
  const [bundle]=await convertComponents(input,[inventorySource(input).find(c=>c.kind==='plugin')!.id],{useCodex:true,dataRoot:'unused',diagnostics:{authenticated:true,capabilities:{exec:true,pluginAdd:true,marketplaceAdd:true,pluginListJson:true,isolatedConversion:true},findings:[]}});
  expect(vi.mocked(adaptWithCodex).mock.calls.at(-1)![0].files.map(file=>file.path)).toEqual(['skills/design/SKILL.md']);
  expect(bundle.files.find(file=>file.path==='skills/design/assets/template/SKILL.md')?.data.toString()).toBe(original);
});

function scopeFixture(entries:Record<string,string>):SourceSnapshot {
  return {id:'selected-scope',request:{url:'https://github.com/acme/studio.git'},commit:'b'.repeat(40),warnings:[],files:Object.entries(entries).map(([path,text])=>({path,data:Buffer.from(text),mode:'100644',oid:''}))};
}
const scopeOptions:ConversionOptions={useCodex:true,dataRoot:'unused',diagnostics:{authenticated:true,capabilities:{exec:true,pluginAdd:true,marketplaceAdd:true,pluginListJson:true,isolatedConversion:true},findings:[]}};

it('mantém as skills originalmente selecionadas ao empacotar e não ativa hooks ou settings preservados como contexto',async()=>{
  // The synthetic output plugin must not turn source-host descriptions into a
  // selected hook integration, or imply that source settings became active.
  const input=scopeFixture({
    '.claude/skills/design/SKILL.md':'---\nname: design\ndescription: Design game systems\n---\nUse Claude Code for design. Read [settings effects](../../docs/effects-map.md).',
    '.claude/skills/review/SKILL.md':'---\nname: review\ndescription: Review game systems\n---\nUse Claude Code for review. Read [settings effects](../../docs/effects-map.md).',
    '.claude/docs/effects-map.md':'# Settings effects\n\n## modes.review_mode\nSelect actual reviewers according to full, lean or solo.\n\n## Source host lifecycle\nSee [callback](../hooks/session-start.sh) and [source settings](../settings.json). These describe source-host behavior.',
    '.claude/hooks/session-start.sh':'#!/bin/bash\nprintf source-host-start\n',
    '.claude/settings.json':'{"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"source-session-start"}]}]}}'
  });
  vi.mocked(adaptWithCodex).mockClear();
  vi.mocked(adaptWithCodex).mockImplementation(async request=>({files:request.files.map(file=>({...file,content:file.content.replaceAll('Claude Code','Codex')})),findings:[]}));
  const selected=inventorySource(input).filter(component=>component.kind==='skill');
  const [bundle]=await convertComponents(input,selected.map(component=>component.id),{...scopeOptions,asPackage:true});
  const request=vi.mocked(adaptWithCodex).mock.calls.at(-1)![0];
  expect(request).toHaveProperty('conversionScope',{
    selectedComponents:[{kind:'skill',root:'.claude/skills/design',name:'design'},{kind:'skill',root:'.claude/skills/review',name:'review'}],
    sourceHooks:{selected:false,converted:false},sourceHostSettingsActivated:false
  });
  expect(bundle.asPackage).toBe(true);
  expect(bundle.files.some(file=>file.sourcePath==='.claude/docs/effects-map.md')).toBe(true);
  expect(bundle.files.some(file=>file.sourcePath==='.claude/hooks/session-start.sh')).toBe(true);
  expect(bundle.files.some(file=>file.sourcePath==='.claude/settings.json')).toBe(true);
  expect(bundle.findings.some(finding=>finding.code==='unsupported-hook'&&finding.severity==='blocking')).toBe(false);
});

it.each(['manifest','hooks-file'] as const)('mantém hooks selecionados por %s no escopo e bloqueados quando ainda não convertidos',async origin=>{
  const input=scopeFixture({
    '.claude-plugin/plugin.json':JSON.stringify(origin==='manifest'?{name:'studio',hooks:{SessionStart:[{command:'source-hook'}]}}:{name:'studio'}),
    ...(origin==='hooks-file'?{'hooks/hooks.json':'{"hooks":{"SessionStart":[{"command":"source-hook"}]}}'}:{}),
    'skills/design/SKILL.md':'---\nname: design\ndescription: Design\n---\nUse Claude Code to design.'
  });
  vi.mocked(adaptWithCodex).mockClear();
  vi.mocked(adaptWithCodex).mockImplementation(async request=>({files:request.files.map(file=>({...file,content:file.content.replaceAll('Claude Code','Codex')})),findings:[]}));
  const plugin=inventorySource(input).find(component=>component.kind==='plugin')!;
  const [bundle]=await convertComponents(input,[plugin.id],scopeOptions);
  const request=vi.mocked(adaptWithCodex).mock.calls.at(-1)![0];
  expect(request).toHaveProperty('conversionScope',{selectedComponents:[{kind:'plugin',root:'',name:'studio'}],sourceHooks:{selected:true,converted:false},sourceHostSettingsActivated:false});
  expect(bundle.installable).toBe(false);
  expect(bundle.findings).toEqual(expect.arrayContaining([expect.objectContaining({code:'unsupported-hook',severity:'blocking'})]));
});

it('não usa o escopo sem hooks para dispensar controle obrigatório da skill selecionada',async()=>{
  const input=scopeFixture({'.claude/skills/strict/SKILL.md':'---\nname: strict\ndescription: Execute with enforced interception\n---\nUse Claude Code native command interception. Reject every shell call before execution unless its command is allowed. Stop if the native enforcement is unavailable.'});
  vi.mocked(adaptWithCodex).mockClear();
  vi.mocked(adaptWithCodex).mockImplementation(async request=>({files:request.files.map(file=>({...file,content:'---\nname: strict\ndescription: Execute with enforced interception\n---\nRequire verified native command interception before every shell call. Stop if unavailable.'})),findings:[{code:'required-runtime-control-unsupported',severity:'blocking',file:'skills/strict/SKILL.md',message:'The selected skill requires native command interception; a procedural checklist does not enforce it.'}]}));
  const [bundle]=await convertComponents(input,[inventorySource(input)[0].id],scopeOptions);
  const request=vi.mocked(adaptWithCodex).mock.calls.at(-1)![0];
  expect(request).toHaveProperty('conversionScope',{selectedComponents:[{kind:'skill',root:'.claude/skills/strict',name:'strict'}],sourceHooks:{selected:false,converted:false},sourceHostSettingsActivated:false});
  expect(bundle.installable).toBe(false);
  expect(bundle.findings).toEqual(expect.arrayContaining([expect.objectContaining({code:'required-runtime-control-unsupported',severity:'blocking',file:'skills/strict/SKILL.md'})]));
});
