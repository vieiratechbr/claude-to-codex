import { expect, it, vi } from 'vitest';
import { convertComponents } from '../../src/core/conversion';
import { inventorySource } from '../../src/core/inventory';
import { adaptWithCodex } from '../../src/core/semantic';
import type { SourceSnapshot } from '../../src/shared/contracts';
vi.mock('../../src/core/semantic', () => ({ adaptWithCodex: vi.fn() }));
it('remove somente o impedimento dinâmico resolvido pela adaptação validada',async()=>{
  const input:SourceSnapshot={id:'dynamic',request:{url:'https://github.com/acme/dynamic'},commit:'a'.repeat(40),warnings:[],files:[{path:'SKILL.md',data:Buffer.from('---\nname: context\ndescription: Read current state\n---\n!`git status --short`\nUse the current status to plan.'),mode:'100644',oid:''}]};
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
