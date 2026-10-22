import { expect, it } from 'vitest';
import { runProcess, checkedProcess } from '../../src/core/process';
it('passa argumentos literalmente e preserva bytes de stdout', async () => {
  const value = '& echo $(não-executar) ' + String.fromCharCode(96) + 'literal';
  const r = await runProcess(process.execPath, ['-e', 'process.stdout.write(process.argv[1])', value], { timeoutMs: 3000, maxBytes: 10000 });
  expect(r.stdout.toString()).toBe(value);
});
it('encerra por limite de saída', async () => {
  await expect(runProcess(process.execPath, ['-e', 'process.stdout.write("a".repeat(100000))'], { timeoutMs: 3000, maxBytes: 100 })).rejects.toThrow(/limite/i);
});
it('encerra por timeout', async () => {
  await expect(runProcess(process.execPath, ['-e', 'setTimeout(()=>{},10000)'], { timeoutMs: 100, maxBytes: 1000 })).rejects.toThrow(/tempo/i);
});
it('cancela processo ativo', async () => {
  const controller = new AbortController();
  const pending = runProcess(process.execPath, ['-e', 'setTimeout(()=>{},10000)'], { timeoutMs: 10000, maxBytes: 1000, signal: controller.signal });
  controller.abort();
  await expect(pending).rejects.toThrow(/cancel/i);
});
it('preserva a saída estruturada de uma falha sem incluí-la na mensagem pública',async()=>{
  const output='{"type":"error","message":"usage_limit_reached"}\n';
  const error=await checkedProcess(process.execPath,['-e','process.stdout.write(process.argv[1]); process.exitCode=1',output]).catch(error=>error);
  expect(error.stdout?.toString()).toBe(output);expect(error.message).not.toContain('usage_limit_reached');
});
