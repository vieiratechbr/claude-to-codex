import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join, posix } from 'node:path';
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
export async function readGitTree(gitDirectory: string, revision: string, limits: SourceLimits = SOURCE_LIMITS, gitPath = 'git', signal?: AbortSignal, subdirectory?: string): Promise<SourceFile[]> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(revision) || revision.includes('..')) throw new Error('Referência inválida.');
  const tree = await checkedProcess(gitPath, ['-c', 'gc.auto=0', '-c', 'maintenance.auto=false', '--git-dir', gitDirectory, 'ls-tree', '-r', '-z', '--full-tree', revision], { signal, timeoutMs: 180000 });
  const scope = subdirectory ? safeRelativePath(subdirectory) : undefined;
  const allRecords = tree.stdout.toString('utf8').split('\0').filter(Boolean);
  const entries = new Map(allRecords.map(record => {
    const match = /^(\d{6}) (blob|commit) ([a-f0-9]+)\t([\s\S]+)$/.exec(record);
    if (!match) throw new Error('Inventário Git inválido.');
    return [match[4], { mode: match[1], kind: match[2], oid: match[3] }] as const;
  }));
  let records = allRecords;
  const ancestors = scope ? ['', ...scope.split('/').slice(0, -1).map((_, i) => scope.split('/').slice(0, i + 1).join('/') + '/')] : [];
  if (scope) {
    if (!records.some(record => record.slice(record.indexOf('\t') + 1).startsWith(scope + '/'))) throw new Error('A pasta selecionada não possui arquivos.');
    records = records.filter(record => {
      const path = record.slice(record.indexOf('\t') + 1);
      return path.startsWith(scope + '/') || ancestors.some(prefix => path.startsWith(prefix) && /^(?:licen[cs]e|notice|copying|copyright)(?:[._-].*)?$/i.test(path.slice(prefix.length)));
    });
  }
  if (records.length > limits.maxFiles) throw new Error('Limite de arquivos excedido.');
  const blobs = new Map<string,Buffer>(); let cachedBytes = 0;
  const selected = records.map(record => {
    const path = record.slice(record.indexOf('\t') + 1); safeRelativePath(path);
    return { path, ...entries.get(path)! };
  }).filter(entry => entry.kind === 'blob');
  const ids = [...new Set(selected.map(entry => entry.oid))];
  if (ids.length) {
    const query = ids.join('\n') + '\n';
    const sizes = await checkedProcess(gitPath, ['--git-dir', gitDirectory, 'cat-file', '--batch-check'], { stdin: query, signal, timeoutMs: 180000 });
    const headers = sizes.stdout.toString('utf8').trimEnd().split('\n');
    if (headers.length !== ids.length) throw new Error('Inventário de objetos incompleto.');
    const lengths = new Map<string,number>();
    for (const [index, header] of headers.entries()) {
      const match = /^([a-f0-9]+) blob (\d+)$/.exec(header);
      if (!match || match[1] !== ids[index]) throw new Error('Objeto Git inválido.');
      const length = Number(match[2]);
      if (!Number.isSafeInteger(length) || length > limits.maxFileBytes) throw new Error('Limite de conteúdo excedido: ' + selected.find(entry => entry.oid === ids[index])!.path);
      lengths.set(match[1], length);
    }
    if (selected.reduce((sum, entry) => sum + lengths.get(entry.oid)!, 0) > limits.maxTotalBytes) throw new Error('Limite de conteúdo excedido.');
    const batch = await checkedProcess(gitPath, ['--git-dir', gitDirectory, 'cat-file', '--batch'], { stdin: query, signal, timeoutMs: 180000, maxBytes: limits.maxTotalBytes + ids.length * 100 });
    let offset = 0;
    for (const id of ids) {
      const end = batch.stdout.indexOf(10, offset);
      if (end < offset) throw new Error('Cabeçalho de objeto incompleto.');
      const header = batch.stdout.subarray(offset, end).toString('utf8');
      const length = lengths.get(id)!;
      if (header !== id + ' blob ' + length || end + 1 + length >= batch.stdout.length || batch.stdout[end + 1 + length] !== 10) throw new Error('Conteúdo Git incompleto.');
      blobs.set(id, batch.stdout.subarray(end + 1, end + 1 + length)); cachedBytes += length; offset = end + length + 2;
    }
    if (offset !== batch.stdout.length) throw new Error('Dados adicionais inesperados do Git.');
  }
  const readBlob = async (oid: string, path: string): Promise<Buffer> => {
    const cached = blobs.get(oid); if (cached) return cached;
    const size = await checkedProcess(gitPath, ['-c', 'gc.auto=0', '-c', 'maintenance.auto=false', '--git-dir', gitDirectory, 'cat-file', '-s', oid], { signal, timeoutMs: 180000 });
    const length = Number(size.stdout.toString().trim());
    if (!Number.isSafeInteger(length) || length < 0) throw new Error('Tamanho Git inválido.');
    if (length > limits.maxFileBytes || cachedBytes + length > limits.maxTotalBytes) throw new Error('Limite de conteúdo excedido: ' + path);
    const blob = await checkedProcess(gitPath, ['--git-dir', gitDirectory, 'cat-file', 'blob', oid], { signal, timeoutMs: 180000, maxBytes: limits.maxFileBytes + 4096 });
    if (blob.stdout.length !== length) throw new Error('Conteúdo Git incompleto.');
    blobs.set(oid, blob.stdout); cachedBytes += length; return blob.stdout;
  };
  const readEntry = async (path: string, links = new Set<string>()): Promise<{ mode: string; oid: string; data: Buffer }> => {
    safeRelativePath(path);
    const entry = entries.get(path);
    if (!entry || entry.kind !== 'blob') throw new Error('Link interno sem arquivo de destino: ' + path);
    if (entry.mode !== '120000') return { mode: entry.mode, oid: entry.oid, data: await readBlob(entry.oid, path) };
    if (links.has(path) || links.size >= 40) throw new Error('Ciclo ou profundidade excedida em link: ' + path);
    const target = (await readBlob(entry.oid, path)).toString('utf8');
    if (posix.isAbsolute(target) || /[\\:\x00-\x1f]/.test(target)) throw new Error('Link fora do repositório: ' + path);
    const destination = safeRelativePath(posix.normalize(posix.join(posix.dirname(path), target)));
    const resolved = await readEntry(destination, new Set([...links, path]));
    return { ...resolved, mode: '100644' };
  };
  const files: SourceFile[] = []; let total = 0; const seen = new Set<string>();
  for (const record of records) {
    const match = /^(\d{6}) (blob|commit) ([a-f0-9]+)\t([\s\S]+)$/.exec(record);
    if (!match) throw new Error('Inventário Git inválido.');
    const [, mode, kind, oid, sourcePath] = match; safeRelativePath(sourcePath);
    const path = scope ? sourcePath.startsWith(scope + '/') ? sourcePath.slice(scope.length + 1) : sourcePath : sourcePath;
    const key = path.normalize('NFC').toLowerCase();
    if (seen.has(key)) throw new Error('Colisão de caminhos no Windows: ' + path); seen.add(key);
    if (kind === 'commit') { files.push({ path, mode, oid, data: Buffer.alloc(0) }); continue; }
    const resolved = await readEntry(sourcePath); total += resolved.data.length;
    if (total > limits.maxTotalBytes) throw new Error('Limite de conteúdo excedido: ' + path);
    files.push({ path, ...resolved });
  }
  return files;
}
export async function acquireSource(input: SourceRequest, context: SourceContext): Promise<SourceSnapshot> {
  const request = parseSourceRequest(input); const id = randomUUID(); const root = join(context.dataRoot, 'sources', id); const gitDirectory = join(root, 'repo.git');
  await assertOwnedPath(context.dataRoot, root); await mkdir(join(root, 'empty-hooks'), { recursive: true });
  context.onProgress?.({ operationId: id, stage: 'download', message: 'Baixando a origem sem executar seus arquivos.' });
  await checkedProcess(context.gitPath, ['-c', 'core.hooksPath=' + join(root, 'empty-hooks'), '-c', 'protocol.file.allow=never', 'clone', '--config', 'gc.auto=0', '--config', 'maintenance.auto=false', '--bare', '--depth=1', '--single-branch', '--filter=blob:limit=' + SOURCE_LIMITS.maxFileBytes, '--no-tags', '--', request.url, gitDirectory], { signal: context.signal, timeoutMs: 180000 });
  const commit = await resolveSourceCommit(gitDirectory, request.ref, context.gitPath, context.signal);
  const files = await readGitTree(gitDirectory, commit, SOURCE_LIMITS, context.gitPath, context.signal, request.subdirectory);
  if (!files.length) throw new Error('A pasta selecionada não possui arquivos.');
  const warnings = files.filter(f => f.mode === '160000' || f.data.toString('utf8', 0, 100).startsWith('version https://git-lfs.github.com/spec/v1')).map(f => 'Recurso externo não baixado: ' + f.path);
  return { id, request, commit, files, warnings };
}
export async function resolveSourceCommit(gitDirectory: string, ref?: string, gitPath = 'git', signal?: AbortSignal): Promise<string> {
  if (ref && (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(ref) || ref.includes('..'))) throw new Error('Referência Git inválida.');
  if (ref) await checkedProcess(gitPath, ['-c','gc.auto=0','-c','maintenance.auto=false','--git-dir',gitDirectory,'fetch','--depth=1','--no-tags','origin',ref], { signal, timeoutMs: 180000 });
  const result = await checkedProcess(gitPath, ['--git-dir',gitDirectory,'rev-parse','--verify','--end-of-options',(ref ? 'FETCH_HEAD' : 'HEAD') + '^{commit}'], { signal });
  const commit = result.stdout.toString().trim();
  if (!/^[a-f0-9]{40,64}$/.test(commit)) throw new Error('Commit da origem inválido.');
  return commit;
}
