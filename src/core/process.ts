import { spawn } from 'node:child_process';
export interface ProcessOptions { cwd?: string; env?: NodeJS.ProcessEnv; stdin?: string|Buffer; signal?: AbortSignal; timeoutMs: number; maxBytes: number }
export interface ProcessResult { stdout: Buffer; stderr: string; exitCode: number }
export function redact(text: string): string {
  return text.replace(/https:\/\/[^/\s@]+@/g, 'https://[oculto]@')
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]+)\b/g, '[credencial oculta]');
}
export async function runProcess(executable: string, args: readonly string[], options: ProcessOptions): Promise<ProcessResult> {
  if (options.signal?.aborted) throw new Error('Operação cancelada.');
  if (/\.(cmd|bat)$/i.test(executable)) throw new Error('Selecione o executável .exe real, em vez de um atalho .cmd.');
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...args], { cwd: options.cwd, env: options.env ?? process.env, shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    const out: Buffer[] = []; const err: Buffer[] = []; let bytes = 0; let failure: Error|undefined; let settled = false;
    const stop = (message: string) => {
      if (failure) return; failure = new Error(message);
      if (child.pid) {
        if (process.platform === 'win32') spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => child.kill());
        else { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
      }
    };
    const timer = setTimeout(() => stop('Tempo limite excedido. Tente novamente.'), options.timeoutMs);
    const aborted = () => stop('Operação cancelada.');
    options.signal?.addEventListener('abort', aborted, { once: true });
    const cleanup = () => { clearTimeout(timer); options.signal?.removeEventListener('abort', aborted); };
    const collect = (target: Buffer[], chunk: Buffer) => { bytes += chunk.length; if (bytes > options.maxBytes) stop('Limite de saída excedido.'); else target.push(chunk); };
    child.stdout.on('data', (chunk: Buffer) => collect(out, chunk));
    child.stderr.on('data', (chunk: Buffer) => collect(err, chunk));
    child.on('error', error => { if (!settled) { settled = true; cleanup(); reject(new Error(redact(error.message))); } });
    child.on('close', code => {
      if (settled) return; settled = true; cleanup();
      if (failure) reject(failure);
      else resolve({ stdout: Buffer.concat(out), stderr: redact(Buffer.concat(err).toString('utf8')), exitCode: code ?? -1 });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(options.stdin);
    if (options.signal?.aborted) aborted();
  });
}
export async function checkedProcess(executable: string, args: readonly string[], options: Partial<ProcessOptions> = {}): Promise<ProcessResult> {
  const result = await runProcess(executable, args, { timeoutMs: 30000, maxBytes: 8 * 1024 * 1024, ...options });
  if (result.exitCode !== 0) throw new Error(redact(result.stderr.trim() || 'O processo terminou com erro (' + result.exitCode + ').'));
  return result;
}
