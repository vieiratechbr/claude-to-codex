import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { adaptWithCodex } from '../../src/core/semantic';
import { checkedProcess, ProcessFailure } from '../../src/core/process';
import type { ConversionOptions } from '../../src/shared/contracts';
vi.mock('../../src/core/process', async importOriginal => ({ ...await importOriginal<typeof import('../../src/core/process')>(), checkedProcess: vi.fn() }));
vi.mock('../../src/core/isolated-codex-home',()=>({createIsolatedCodexHome:vi.fn(async(root:string)=>({env:{CODEX_HOME:root+'/fixture-home'},cleanup:async()=>{}}))}));
const temporary: string[] = [];
afterEach(async () => { vi.mocked(checkedProcess).mockReset(); for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true }); });
async function context(): Promise<ConversionOptions> {
  const dataRoot = await mkdtemp(join(tmpdir(), 'c2c-semantic-batch-')); temporary.push(dataRoot);
  return { useCodex: true, dataRoot, diagnostics: { authenticated: true, codexPath: 'codex.exe', capabilities: { exec: true, pluginAdd: true, marketplaceAdd: true, pluginListJson: true, isolatedConversion: true }, findings: [] } };
}
function answer(files: { path: string; edits: { oldText: string; newText: string }[] }[], findings: { code: string; severity: 'warning'; message: string }[] = []) {
  return { stdout: Buffer.from(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify({ files, findings }) } })), stderr: '', exitCode: 0 };
}
function request(options: any) { return JSON.parse(String(options.stdin).split('Material a converter:\n')[1]); }
it('adapta todas as skills grandes sem exigir uma resposta monolítica do modelo', async () => {
  const files = Array.from({ length: 7 }, (_, i) => ({ path: `skills/design-${i}/SKILL.md`, content: 'Claude Code\n' + 'Reference detail.\n'.repeat(500) }));
  vi.mocked(checkedProcess).mockImplementation(async (_exe, _args, options) => {
    const input = request(options);
    if (input.files.length > 1) throw new Error('Model response budget exceeded');
    return answer(input.files.map((f: any) => ({ path: f.path, edits: [{ oldText: 'Claude Code', newText: 'Codex' }] })));
  });
  const result = await adaptWithCodex({ files, findings: [] }, await context());
  expect(result.files).toEqual(files.map(f => ({ ...f, content: f.content.replace('Claude Code', 'Codex') })));
});
it('não aceita troca de caminho em um lote posterior', async () => {
  vi.mocked(checkedProcess).mockImplementation(async (_exe, _args, options) => {
    const input = request(options); const file = input.files[0];
    return answer([{ path: file.path.includes('/two/') ? 'skills/other/SKILL.md' : file.path, edits: [] }]);
  });
  const result = await adaptWithCodex({ files: [{ path: 'skills/one/SKILL.md', content: 'One' }, { path: 'skills/two/SKILL.md', content: 'Two' }], findings: [] }, await context());
  expect(result.files).toEqual([{ path: 'skills/one/SKILL.md', content: 'One' }]);
  expect(result.findings).toEqual([expect.objectContaining({ code: 'semantic-failed', severity: 'blocking', file: 'skills/two/SKILL.md', message: expect.stringMatching(/lista de arquivos/i) })]);
  expect(checkedProcess).toHaveBeenCalledTimes(2);
});
it.each(['absent', 'repeated'])('rejeita edição sem trecho de origem único: %s', async token => {
  vi.mocked(checkedProcess).mockResolvedValue(answer([{ path: 'skills/one/SKILL.md', edits: [{ oldText: token, newText: 'changed' }] }]));
  await expect(adaptWithCodex({ files: [{ path: 'skills/one/SKILL.md', content: 'repeated repeated' }], findings: [] }, await context())).rejects.toThrow(/trecho único/i);
});
it('reenvia edição ambígua com feedback e aplica somente a correção exata',async()=>{
  let calls=0;
  vi.mocked(checkedProcess).mockImplementation(async(_exe,_args,options)=>{
    const input=request(options),file=input.files[0];calls++;
    if(calls===1)return answer([{path:file.path,edits:[{oldText:'repeated',newText:'wrong'}]}]);
    expect(input.validationFeedback).toMatch(/trecho único/i);
    expect(file.content).toBe('Claude Code repeated repeated');
    return answer([{path:file.path,edits:[{oldText:'Claude Code',newText:'Codex'}]}]);
  });
  const result=await adaptWithCodex({files:[{path:'skills/repair/SKILL.md',content:'Claude Code repeated repeated'}],findings:[]},await context());
  expect(result.files[0].content).toBe('Codex repeated repeated');expect(calls).toBe(2);
});
it('rejeita edições sobrepostas em vez de aplicar uma origem já alterada', async () => {
  vi.mocked(checkedProcess).mockResolvedValue(answer([{ path: 'skills/one/SKILL.md', edits: [{ oldText: 'abc', newText: 'X' }, { oldText: 'bcd', newText: 'Y' }] }]));
  await expect(adaptWithCodex({ files: [{ path: 'skills/one/SKILL.md', content: 'abcdef' }], findings: [] }, await context())).rejects.toThrow(/sobrepostas/i);
});
it('limita o conteúdo combinado mesmo quando cada resposta cabe no orçamento', async () => {
  vi.mocked(checkedProcess).mockImplementation(async (_exe, _args, options) => answer([{ path: request(options).files[0].path, edits: [{ oldText: 'ORIGINAL', newText: 'A'.repeat(2 * 1024 * 1024 - 200) }] }]));
  const files = Array.from({ length: 5 }, (_, i) => ({ path: `skills/design-${i}/SKILL.md`, content: 'ORIGINAL' }));
  await expect(adaptWithCodex({ files, findings: [] }, await context())).rejects.toThrow(/acumulada/i);
});
it('corrige uma adaptação incompleta com feedback dos sinais restantes', async () => {
  let calls = 0;
  vi.mocked(checkedProcess).mockImplementation(async (_exe, _args, options) => {
    const input = request(options); const file = input.files[0]; calls++;
    if (calls === 1) return answer([{ path: file.path, edits: [{ oldText: file.content, newText: 'Use Codex. Read $ARGUMENTS.' }] }], [{ code: 'runtime-required', severity: 'warning', message: 'Runtime requires user setup.' }]);
    expect(input.validationFeedback).toContain('$ARGUMENTS');
    return answer([{ path: file.path, edits: [{ oldText: '$ARGUMENTS', newText: "the user's request" }] }]);
  });
  const result = await adaptWithCodex({ files: [{ path: 'skills/one/SKILL.md', content: 'Use Claude Code.' }], findings: [] }, await context());
  expect(result.files[0].content).toBe("Use Codex. Read the user's request.");
  expect(calls).toBe(2);
  expect(result.findings.some(f => f.code === 'runtime-required' && f.file === 'skills/one/SKILL.md')).toBe(true);
});
it('contabiliza também as propostas incompletas antes de gravar diagnósticos', async () => {
  let calls = 0;
  vi.mocked(checkedProcess).mockImplementation(async (_exe, _args, options) => {
    const file = request(options).files[0]; calls++;
    return answer([{ path: file.path, edits: [{ oldText: file.content, newText: calls % 2 ? 'A'.repeat(900 * 1024) + ' Claude Code.' : 'Use Codex.' }] }]);
  });
  const files = Array.from({ length: 10 }, (_, i) => ({ path: `skills/design-${i}/SKILL.md`, content: 'Use Claude Code.' }));
  await expect(adaptWithCodex({ files, findings: [] }, await context())).rejects.toThrow(/acumulada/i);
});
it('charges rejected raw responses against the global budget before schema parsing', async () => {
  vi.mocked(checkedProcess).mockImplementation(async () => ({
    stdout: Buffer.from(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify({files:[],findings:[],unexpected:'A'.repeat(5*1024*1024)})}})),
    stderr:'',exitCode:0
  }));
  const files=Array.from({length:4},(_,index)=>({path:`skills/work-${index}/SKILL.md`,content:'Portable advice.'}));
  await expect(adaptWithCodex({files,findings:[]},await context())).rejects.toThrow(/acumulada/i);
  expect(checkedProcess).toHaveBeenCalledTimes(2);
});
it('encerra a correção após duas tentativas e identifica a skill incompleta', async () => {
  vi.mocked(checkedProcess).mockResolvedValue(answer([{ path: 'skills/one/SKILL.md', edits: [] }]));
  await expect(adaptWithCodex({ files: [{ path: 'skills/one/SKILL.md', content: 'Use Claude Code.' }], findings: [] }, await context())).rejects.toThrow(/skills\/one\/SKILL\.md/);
  expect(checkedProcess).toHaveBeenCalledTimes(2);
});
it.each(['process-error', 'structured-error'] as const)('preserves validated proposals and stops remaining files after global quota failure: %s', async failure => {
  const files = ['one', 'two', 'three', 'four'].map(name => ({ path: `skills/${name}/SKILL.md`, content: 'Use Claude Code.' }));
  vi.mocked(checkedProcess).mockImplementation(async (_exe, _args, options) => {
    const file = request(options).files[0];
    if (file.path === 'skills/three/SKILL.md') {
      if (failure === 'process-error') throw new Error('You’ve hit your usage limit. Try again after the reset.');
      return { stdout: Buffer.from(JSON.stringify({ type: 'turn.failed', error: { code: 'usage_limit_reached', message: 'You have reached your usage limit.' } })), stderr: '', exitCode: 0 };
    }
    return answer([{ path: file.path, edits: [{ oldText: 'Claude Code', newText: 'Codex' }] }], [{ code: 'runtime-required', severity: 'warning', message: 'Check runtime during skill use.' }]);
  });
  const result = await adaptWithCodex({ files, findings: [] }, await context());
  expect(result.files).toEqual([
    { path: 'skills/one/SKILL.md', content: 'Use Codex.' },
    { path: 'skills/two/SKILL.md', content: 'Use Codex.' }
  ]);
  expect(result.findings.filter(f => f.code === 'runtime-required').map(f => f.file)).toEqual(['skills/one/SKILL.md', 'skills/two/SKILL.md']);
  expect(result.findings.filter(f => f.code === 'semantic-global-failed')).toEqual([
    expect.objectContaining({ severity: 'blocking', message: expect.stringMatching(/usage limit/) })
  ]);
  expect(result.findings.filter(f => f.code === 'semantic-not-processed')).toEqual([
    expect.objectContaining({ severity: 'blocking', file: 'skills/three/SKILL.md' }),
    expect.objectContaining({ severity: 'blocking', file: 'skills/four/SKILL.md' })
  ]);
  expect(checkedProcess).toHaveBeenCalledTimes(3);
});
it('keeps the single-file rejection contract without retrying a global quota failure', async () => {
  vi.mocked(checkedProcess).mockRejectedValue(new Error('insufficient_quota: usage limit reached'));
  await expect(adaptWithCodex({ files: [{ path: 'skills/one/SKILL.md', content: 'Use Claude Code.' }], findings: [] }, await context())).rejects.toThrow(/insufficient_quota/);
  expect(checkedProcess).toHaveBeenCalledTimes(1);
});
it('requires concrete target procedures for source API and import examples without an archive exemption', async () => {
  let instructions = '';
  vi.mocked(checkedProcess).mockImplementation(async (_exe, _args, options) => {
    instructions = String(options?.stdin).split('Material a converter:\n')[0];
    const file = request(options).files[0];
    return answer([{ path: file.path, edits: [{ oldText: 'Claude Code', newText: 'Codex' }] }]);
  });
  await adaptWithCodex({ files: [{ path: 'skills/one/SKILL.md', content: 'Use Claude Code.' }], findings: [] }, await context());
  expect(instructions).toMatch(/exemplos de APIs ou imports da origem[^.]*procedimento concreto[^.]*equivalente[^.]*Codex/i);
  expect(instructions).toMatch(/proveniência[^.]*metadados de origem[^.]*prosa genérica/i);
  expect(instructions).toMatch(/não repita[^.]*tokens[^.]*blocos de código[^.]*recursos ativos/i);
  expect(instructions).toMatch(/Não rotule[^.]*arquiv/i);
  expect(instructions).toMatch(/Preserve integralmente[^.]*verificações funcionais[^.]*escolhas/i);
});
it('resumes a quota-interrupted batch without repeating a validated file',async()=>{
 const files=['one','two'].map(name=>({path:`skills/${name}/SKILL.md`,content:'Use Claude Code.'}));const ctx=await context();let calls=0;
 vi.mocked(checkedProcess).mockImplementation(async(_exe,_args,options)=>{
  const file=request(options).files[0];if(++calls===2)throw Error('insufficient_quota');
  return answer([{path:file.path,edits:[{oldText:'Claude Code',newText:'Codex'}]}]);
 });
 expect((await adaptWithCodex({files,findings:[]},ctx)).files).toHaveLength(1);
 const resumed=await adaptWithCodex({files,findings:[]},ctx);
 expect(resumed.files).toHaveLength(2);expect(calls).toBe(3);
 expect(resumed.findings.some(f=>f.code==='semantic-cache-used'&&f.file===files[0].path)).toBe(true);
});
it('invalidates saved adaptations when any complete supporting resource changes',async()=>{
 const ctx=await context(),files=[{path:'skills/one/SKILL.md',content:'Use Claude Code.'}];
 vi.mocked(checkedProcess).mockResolvedValue(answer([{path:files[0].path,edits:[{oldText:'Claude Code',newText:'Codex'}]}]));
 for(const tail of ['original','changed'])await adaptWithCodex({files,findings:[],supportingFiles:[{path:'reference.md',data:Buffer.from('Same head\n'.repeat(3000)+tail)}]},ctx);
 expect(checkedProcess).toHaveBeenCalledTimes(2);
});
it('revalidates cached text against the current full workflow validator',async()=>{
 const ctx=await context(),files=[{path:'skills/one/SKILL.md',content:'original'}];let calls=0;
 vi.mocked(checkedProcess).mockImplementation(async()=>answer([{path:files[0].path,edits:[{oldText:'original',newText:++calls===1?'unsafe':'safe'}]}]));
 await adaptWithCodex({files,findings:[]},ctx);
 const result=await adaptWithCodex({files,findings:[],validateFile:file=>file.content==='unsafe'?[{code:'unsafe-write',severity:'blocking',message:'Write must target the project.'}]:[]},ctx);
 expect(result.files[0].content).toBe('safe');expect(calls).toBe(2);
});
it('never caches a result with an unresolved functional blocker',async()=>{
 const ctx=await context(),files=[{path:'skills/one/SKILL.md',content:'original'}];
 vi.mocked(checkedProcess).mockResolvedValue(answer([{path:files[0].path,edits:[]}],[{code:'unsupported',severity:'blocking',message:'No equivalent.'}] as any));
 await adaptWithCodex({files,findings:[]},ctx);await adaptWithCodex({files,findings:[]},ctx);
 expect(checkedProcess).toHaveBeenCalledTimes(2);
});
it('offers one correction for a concrete post-conversion workflow failure',async()=>{
 const ctx=await context(),files=[{path:'skills/one/SKILL.md',content:'original'}];let calls=0;
 vi.mocked(checkedProcess).mockImplementation(async(_exe,_args,options)=>{
  const input=request(options);if(calls++)expect(input.validationFeedback).toContain('unsafe-write');
  return answer([{path:files[0].path,edits:[{oldText:input.files[0].content,newText:calls===1?'unsafe':'safe'}]}]);
 });
 const result=await adaptWithCodex({files,findings:[],validateFile:file=>file.content==='unsafe'?[{code:'unsafe-write',severity:'blocking',message:'Write must target the project.'}]:[]},ctx);
 expect(result.files[0].content).toBe('safe');expect(calls).toBe(2);
 const repeated=await adaptWithCodex({files,findings:[],validateFile:file=>file.content==='unsafe'?[{code:'unsafe-write',severity:'blocking',message:'Write must target the project.'}]:[]},ctx);
 expect(repeated.files[0].content).toBe('safe');expect(calls).toBe(2);
});
it('interrompe o pacote quando o CLI retorna limite em JSON com código não zero e stderr vazio',async()=>{
 const files=['one','two','three'].map(name=>({path:`skills/${name}/SKILL.md`,content:'Use Claude Code.'}));
 vi.mocked(checkedProcess).mockRejectedValue(new ProcessFailure({exitCode:1,stderr:'',stdout:Buffer.from(JSON.stringify({type:'turn.failed',error:{code:'usage_limit_reached',message:'You have reached your usage limit.'}}))}));
 const result=await adaptWithCodex({files,findings:[]},await context());
 expect(checkedProcess).toHaveBeenCalledTimes(1);
 expect(result.findings).toEqual(expect.arrayContaining([expect.objectContaining({code:'semantic-global-failed',message:expect.stringContaining('usage limit')})]));
 expect(result.findings.filter(f=>f.code==='semantic-not-processed')).toHaveLength(3);
});
it('preserva os documentos pendentes quando a descoberta global do workspace fica indisponível',async()=>{
 const files=['one','two'].map(name=>({path:`skills/${name}/SKILL.md`,content:'Use Claude Code.'}));
 vi.mocked(checkedProcess).mockRejectedValue(new Error('Reconnecting... 2/5 (workspace routing discovery timed out)'));
 const result=await adaptWithCodex({files,findings:[]},await context());
 expect(checkedProcess).toHaveBeenCalledTimes(1);expect(result.findings.filter(f=>f.code==='semantic-not-processed')).toHaveLength(2);
});
it('contabiliza stdout de processos com falha no limite acumulado da conversão',async()=>{
 const files=['one','two','three','four'].map(name=>({path:`skills/${name}/SKILL.md`,content:'Review workflow.'}));
 vi.mocked(checkedProcess).mockRejectedValue(new ProcessFailure({exitCode:1,stderr:'Invalid generated response.',stdout:Buffer.alloc(3*1024*1024,65)}));
 await expect(adaptWithCodex({files,findings:[]},await context())).rejects.toThrow(/acumulada/i);
 expect(checkedProcess).toHaveBeenCalledTimes(3);
});
