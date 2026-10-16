import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { adaptWithCodex } from '../../src/core/semantic';
import { checkedProcess } from '../../src/core/process';
import type { ConversionOptions } from '../../src/shared/contracts';
vi.mock('../../src/core/process', async importOriginal => ({ ...await importOriginal<typeof import('../../src/core/process')>(), checkedProcess: vi.fn() }));
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
  await expect(adaptWithCodex({ files: [{ path: 'skills/one/SKILL.md', content: 'One' }, { path: 'skills/two/SKILL.md', content: 'Two' }], findings: [] }, await context())).rejects.toThrow(/lista de arquivos/i);
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
it('encerra a correção após duas tentativas e identifica a skill incompleta', async () => {
  vi.mocked(checkedProcess).mockResolvedValue(answer([{ path: 'skills/one/SKILL.md', edits: [] }]));
  await expect(adaptWithCodex({ files: [{ path: 'skills/one/SKILL.md', content: 'Use Claude Code.' }], findings: [] }, await context())).rejects.toThrow(/skills\/one\/SKILL\.md/);
  expect(checkedProcess).toHaveBeenCalledTimes(2);
});
