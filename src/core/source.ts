import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { SOURCE_LIMITS, type SourceContext, type SourceFile, type SourceLimits, type SourceRequest, type SourceSnapshot } from '../shared/contracts';
import { checkedProcess } from './process';
import { assertOwnedPath, safeRelativePath } from './paths';
export function parseSourceRequest(input: unknown): SourceRequest {
  const data = z.object({ url: z.string().trim().max(1000), ref: z.string().trim().max(200).optional(), subdirectory: z.string().trim().max(220).optional() }).strict().parse(input);
  const url = new URL(data.url);
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash ||
    !/^\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\/?$/.test(url.pathname)) throw new Error('Use a URL HTTPS do repositório GitHub, sem credenciais. Informe branch e pasta nos campos separados.');
  const path = url.pathname.replace(/\/$/, '').replace(/\.git$/, '');
  const segments = path.slice(1).split('/');
  if (segments.some(p => p === '.' || p === '..')) throw new Error('Repositório inválido.');
  if (data.ref && (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(data.ref) || data.ref.includes('..'))) throw new Error('Referência Git inválida.');
  return { url: 'https://github.com' + path + '.git', ref: data.ref || undefined, subdirectory: data.subdirectory ? safeRelativePath(data.subdirectory) : undefined };
}
export async function readGitTree(gitDirectory: string, revision: string, limits: SourceLimits = SOURCE_LIMITS, gitPath = 'git', signal?: AbortSignal): Promise<SourceFile[]> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(revision) || revision.includes('..')) throw new Error('Referência inválida.');
  const tree = await checkedProcess(gitPath, ['--git-dir', gitDirectory, 'ls-tree', '-r', '-z', '-l', '--full-tree', revision], { signal, timeoutMs: 180000 });
  const records = tree.stdout.toString('utf8').split('\0').filter(Boolean);
  if (records.length > limits.maxFiles) throw new Error('Limite de arquivos excedido.');
  const files: SourceFile[] = []; let total = 0; const seen = new Set<string>();
  for (const record of records) {
    const match = /^(\d{6}) (blob|commit) ([a-f0-9]+)\s+(-|\d+)\t([\s\S]+)$/.exec(record);
    if (!match) throw new Error('Inventário Git inválido.');
    const [, mode, kind, oid, size, path] = match; safeRelativePath(path);
    const key = path.normalize('NFC').toLowerCase();
    if (seen.has(key)) throw new Error('Colisão de caminhos no Windows: ' + path); seen.add(key);
    if (mode === '120000') throw new Error('Link simbólico na origem: ' + path);
    if (kind === 'commit') { files.push({ path, mode, oid, data: Buffer.alloc(0) }); continue; }
    const length = Number(size); total += length;
    if (length > limits.maxFileBytes || total > limits.maxTotalBytes) throw new Error('Limite de conteúdo excedido: ' + path);
    const blob = await checkedProcess(gitPath, ['--git-dir', gitDirectory, 'cat-file', 'blob', oid], { signal, timeoutMs: 180000, maxBytes: limits.maxFileBytes + 4096 });
    files.push({ path, mode, oid, data: blob.stdout });
  }
  return files;
}
export async function acquireSource(input: SourceRequest, context: SourceContext): Promise<SourceSnapshot> {
  const request = parseSourceRequest(input); const id = randomUUID(); const root = join(context.dataRoot, 'sources', id); const gitDirectory = join(root, 'repo.git');
  await assertOwnedPath(context.dataRoot, root); await mkdir(join(root, 'empty-hooks'), { recursive: true });
  context.onProgress?.({ operationId: id, stage: 'download', message: 'Baixando a origem sem executar seus arquivos.' });
  await checkedProcess(context.gitPath, ['-c', 'core.hooksPath=' + join(root, 'empty-hooks'), '-c', 'protocol.file.allow=never', 'clone', '--bare', '--filter=blob:none', '--no-tags', '--', request.url, gitDirectory], { signal: context.signal, timeoutMs: 180000 });
  const resolved = await checkedProcess(context.gitPath, ['--git-dir', gitDirectory, 'rev-parse', '--verify', '--end-of-options', (request.ref || 'HEAD') + '^{commit}'], { signal: context.signal });
  const commit = resolved.stdout.toString().trim();
  if (!/^[a-f0-9]{40,64}$/.test(commit)) throw new Error('Commit da origem inválido.');
  let files = await readGitTree(gitDirectory, commit, SOURCE_LIMITS, context.gitPath, context.signal);
  if (request.subdirectory) files = files.filter(f => f.path.startsWith(request.subdirectory + '/')).map(f => ({ ...f, path: f.path.slice(request.subdirectory!.length + 1) }));
  if (!files.length) throw new Error('A pasta selecionada não possui arquivos.');
  const warnings = files.filter(f => f.mode === '160000' || f.data.toString('utf8', 0, 100).startsWith('version https://git-lfs.github.com/spec/v1')).map(f => 'Recurso externo não baixado: ' + f.path);
  return { id, request, commit, files, warnings };
}
