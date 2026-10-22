import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { adaptWithCodex } from '../../src/core/semantic';
import { checkedProcess } from '../../src/core/process';
import { convertComponents } from '../../src/core/conversion';
import { inventorySource } from '../../src/core/inventory';
import type { ConversionOptions, SourceSnapshot } from '../../src/shared/contracts';
import {createIsolatedCodexHome} from '../../src/core/isolated-codex-home';

vi.mock('../../src/core/process', async original => ({ ...await original<typeof import('../../src/core/process')>(), checkedProcess: vi.fn() }));
vi.mock('../../src/core/isolated-codex-home',()=>({createIsolatedCodexHome:vi.fn(async(root:string)=>({env:{CODEX_HOME:root+'/fixture-home'},cleanup:async()=>{}}))}));
const temporary: string[] = [];
afterEach(async () => {
  vi.mocked(checkedProcess).mockReset();
  for (const root of temporary.splice(0)) await rm(root, { recursive: true, force: true });
});
async function context(): Promise<ConversionOptions> {
  const dataRoot = await mkdtemp(join(tmpdir(), 'c2c-isolation-')); temporary.push(dataRoot);
  return { useCodex: true, dataRoot, diagnostics: { codexPath: 'codex.exe', authenticated: true, capabilities: { exec: true, isolatedConversion: true, pluginAdd: true, marketplaceAdd: true, pluginListJson: true }, findings: [] } };
}
const files = ['one', 'two', 'three'].map(name => ({ path: `skills/${name}/SKILL.md`, content: 'Use Claude Code.' }));
function answer(value: unknown) {
  return { stdout: Buffer.from(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(value) } })), stderr: '', exitCode: 0 };
}
function fileFrom(options: { stdin?: string | Buffer } = {}) {
  return (JSON.parse(String(options.stdin).split('Material a converter:\n')[1]) as { files: typeof files }).files[0];
}
function valid(file: typeof files[number]) {
  return answer({ files: [{ path: file.path, edits: [{ oldText: 'Claude Code', newText: 'Codex' }] }], findings: [] });
}

it.each(['schema', 'wrong-path', 'residual', 'timeout', 'ambiguous-edits', 'tool-use'] as const)('keeps valid files before and after a rejected %s response', async failure => {
  vi.mocked(checkedProcess).mockImplementation(async (_exe, _args, options) => {
    const file = fileFrom(options);
    if (file.path !== 'skills/two/SKILL.md') return valid(file);
    if (failure === 'timeout') throw new Error('Synthetic timeout');
    if (failure === 'tool-use') return { stdout: Buffer.from(JSON.stringify({ type: 'item.completed', item: { type: 'command_execution', command: 'forbidden' } })), stderr: '', exitCode: 0 };
    if (failure === 'schema') return answer({ files: [{ path: file.path, edits: [{ oldText: null, newText: 'invalid' }] }], findings: [] });
    if (failure === 'wrong-path') return answer({ files: [{ path: 'skills/foreign/SKILL.md', edits: [] }], findings: [] });
    if (failure === 'ambiguous-edits') return answer({ files: [{ path: file.path, edits: [{ oldText: 'absent', newText: 'invalid' }] }], findings: [] });
    return answer({ files: [{ path: file.path, edits: [] }], findings: [] });
  });
  const result = await adaptWithCodex({ files, findings: [] }, await context());
  expect(result.files).toEqual([{ path: 'skills/one/SKILL.md', content: 'Use Codex.' }, { path: 'skills/three/SKILL.md', content: 'Use Codex.' }]);
  expect(result.findings).toEqual([expect.objectContaining({ code: 'semantic-failed', severity: 'blocking', file: 'skills/two/SKILL.md' })]);
  expect(vi.mocked(checkedProcess).mock.calls.filter(([, , options]) => fileFrom(options || {}).path === 'skills/two/SKILL.md')).toHaveLength(['residual', 'ambiguous-edits'].includes(failure) ? 2 : 1);
});

it('attempts every selected skill in a large package and retains blocking status for a failed member', async () => {
  const source: SourceSnapshot = { id: 'large-package', request: { url: 'https://github.com/acme/workflows' }, commit: 'a'.repeat(40), warnings: [], files: Array.from({ length: 74 }, (_, index) => ({ path: `skills/work-${index}/SKILL.md`, mode: '100644', oid: '', data: Buffer.from(`---\nname: work-${index}\ndescription: Work\n---\nUse Claude Code.`) })) };
  vi.mocked(checkedProcess).mockImplementation(async (_exe, _args, options) => {
    const file = fileFrom(options);
    if (file.path === 'skills/work-1/SKILL.md') return answer({ files: [], findings: [] });
    return valid(file);
  });
  const [bundle] = await convertComponents(source, inventorySource(source).map(item => item.id), { ...await context(), asPackage: true });
  expect(bundle.installable).toBe(false);
  expect(bundle.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'semantic-failed', severity: 'blocking', file: 'skills/work-1/SKILL.md' })]));
  expect(bundle.files.find(file => file.path === 'skills/work-0/SKILL.md')!.data.toString()).toContain('Use Codex.');
  expect(bundle.files.find(file => file.path === 'skills/work-73/SKILL.md')!.data.toString()).toContain('Use Codex.');
  expect(bundle.files.find(file => file.path === 'skills/work-1/SKILL.md')!.data.toString()).toContain('Use Claude Code.');
  expect(checkedProcess).toHaveBeenCalledTimes(74);
});

it('does not pass a residual proposal to the package even when the model reports a blocker', async () => {
  vi.mocked(checkedProcess).mockImplementation(async (_exe, _args, options) => {
    const file = fileFrom(options);
    if (file.path !== 'skills/two/SKILL.md') return valid(file);
    return answer({ files: [{ path: file.path, edits: [] }], findings: [{ code: 'unsupported-contract', severity: 'blocking', message: 'The required native facility has no verified equivalent.' }] });
  });
  const result = await adaptWithCodex({ files, findings: [] }, await context());
  expect(result.files.map(file => file.path)).toEqual(['skills/one/SKILL.md', 'skills/three/SKILL.md']);
  expect(result.findings).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'unsupported-contract', severity: 'blocking', file: 'skills/two/SKILL.md' }),
    expect.objectContaining({ code: 'semantic-failed', severity: 'blocking', file: 'skills/two/SKILL.md' })
  ]));
});

it('stops the batch when cancellation occurs during a file', async () => {
  const controller = new AbortController();
  vi.mocked(checkedProcess).mockImplementation(async () => { controller.abort(); throw new Error('Operação cancelada.'); });
  await expect(adaptWithCodex({ files, findings: [] }, { ...await context(), signal: controller.signal })).rejects.toThrow(/cancelada/);
  expect(checkedProcess).toHaveBeenCalledTimes(1);
});

it.each(['authentication', 'capability'] as const)('rejects unavailable %s before requesting any file', async missing => {
  const options = await context();
  if (missing === 'authentication') options.diagnostics.authenticated = false;
  else options.diagnostics.capabilities.isolatedConversion = false;
  await expect(adaptWithCodex({ files, findings: [] }, options)).rejects.toThrow(/indisponível/);
  expect(checkedProcess).not.toHaveBeenCalled();
});

it.each([
  {cause:'You’ve hit your usage limit. Try again at Oct 18th, 2026 4:35 AM.',expected:/usage limit/},
  {cause:'HTTP 401 Unauthorized: authentication token expired. Please log in again.',expected:/401|autentica/i},
  {cause:'Your authentication token has expired. Please try signing in again.',expected:/token has expired/i},
  {cause:'Error loading configuration: unknown field in the isolation settings.',expected:/configuration/i},
  {cause:"error: unexpected argument '--unsupported' found\nUsage: codex exec [OPTIONS] [PROMPT]",expected:/unexpected argument|configura/i}
])('stops the whole batch once for global runtime failure: $cause',async({cause,expected})=>{
  const noise=Array.from({length:150},(_,i)=>`2026-10-18T03:00:00Z ERROR failed to load skill C:/personal/malformed-${i}/SKILL.md: missing YAML frontmatter`).join('\n');
  vi.mocked(checkedProcess).mockRejectedValue(new Error(noise+'\n'+cause+'\nWARN MCP server startup failed during shutdown'));
  const result=await adaptWithCodex({files,findings:[]},await context());
  expect(result.files).toEqual([]);
  const global=result.findings.filter(finding=>finding.code==='semantic-global-failed');
  expect(global).toHaveLength(1);
  expect(global[0].severity).toBe('blocking');
  expect(global[0].message).toMatch(expected);
  expect(global[0].message.length).toBeLessThanOrEqual(1600);
  expect(global[0].message).not.toContain('C:/personal/');
  expect(result.findings.filter(finding=>finding.code==='semantic-not-processed')).toEqual(files.map(file=>expect.objectContaining({file:file.path,severity:'blocking'})));
  expect(checkedProcess).toHaveBeenCalledTimes(1);
});

it('stops remaining files for a structured global usage failure',async()=>{
  vi.mocked(checkedProcess).mockResolvedValue({stdout:Buffer.from(JSON.stringify({type:'turn.failed',error:{code:'usage_limit_reached',message:'You have reached your usage limit; retry after the reset.'}})),stderr:'',exitCode:0});
  const result=await adaptWithCodex({files,findings:[]},await context());
  expect(result.files).toEqual([]);
  expect(result.findings.filter(finding=>finding.code==='semantic-global-failed')).toEqual([expect.objectContaining({severity:'blocking',message:expect.stringMatching(/usage|limite/i)})]);
  expect(result.findings.filter(finding=>finding.code==='semantic-not-processed').map(finding=>finding.file)).toEqual(files.map(file=>file.path));
  expect(checkedProcess).toHaveBeenCalledTimes(1);
});

it('bounds file-local runtime errors without discarding the actual tail cause or other proposals',async()=>{
  vi.mocked(checkedProcess).mockImplementation(async(_exe,_args,options)=>{
    const file=fileFrom(options);
    if(file.path==='skills/two/SKILL.md')throw new Error(('ERROR failed to load skill C:/personal/malformed/SKILL.md: missing YAML frontmatter\n').repeat(200)+'Fixture conversion timed out while waiting for the result.');
    return valid(file);
  });
  const result=await adaptWithCodex({files,findings:[]},await context());
  expect(result.files.map(file=>file.path)).toEqual(['skills/one/SKILL.md','skills/three/SKILL.md']);
  expect(result.findings).toHaveLength(1);
  expect(result.findings[0].message.length).toBeLessThanOrEqual(1600);
  expect(result.findings[0].message).toContain('Fixture conversion timed out');
  expect(result.findings[0].message).not.toContain('C:/personal/');
});

it('disables local plugins, MCP and automatic skills context for restricted conversion',async()=>{
  vi.mocked(checkedProcess).mockImplementation(async(_exe,args,options)=>{
    const disabled=args.flatMap((value,index)=>value==='--disable'?[args[index+1]]:[]);
    expect(disabled).toEqual(expect.arrayContaining(['plugins','shell_tool','unified_exec','hooks','apps','multi_agent','remote_plugin','skill_mcp_dependency_install','memories','view_image','image_generation','skill_search']));
    const settings=args.flatMap((value,index)=>value==='-c'?[args[index+1]]:[]);
    expect(settings).toContain('model_reasoning_effort="low"');
    expect(settings).toEqual(expect.arrayContaining(['skills.include_instructions=false','skills.bundled.enabled=false','mcp_servers={}','project_doc_max_bytes=0']));
    expect(args).toEqual(expect.arrayContaining(['--ignore-user-config','--ignore-rules','--ephemeral','--sandbox','read-only']));
    return valid(fileFrom(options));
  });
  const result=await adaptWithCodex({files:[files[0]],findings:[]},await context());
  expect(result.files).toEqual([{path:'skills/one/SKILL.md',content:'Use Codex.'}]);
});
it.each(['success','failure','cancel'] as const)('cleans the isolated auth home after %s',async mode=>{
  const cleanup=vi.fn(async()=>{}),controller=new AbortController();
  vi.mocked(createIsolatedCodexHome).mockResolvedValueOnce({env:{CODEX_HOME:'fixture-isolated-home'},cleanup});
  vi.mocked(checkedProcess).mockImplementation(async(_exe,_args,options)=>{
    expect(options?.env?.CODEX_HOME).toBe('fixture-isolated-home');
    if(mode==='cancel'){controller.abort();throw Error('Operação cancelada.');}
    if(mode==='failure')throw Error('Synthetic timeout');
    return valid(fileFrom(options));
  });
  const operation=adaptWithCodex({files:[files[0]],findings:[]},{...await context(),signal:controller.signal});
  if(mode==='success')await expect(operation).resolves.toMatchObject({files:[{content:'Use Codex.'}]});
  else await expect(operation).rejects.toThrow();
  expect(cleanup).toHaveBeenCalledTimes(1);
});
