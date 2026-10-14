import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { BundleFile } from '../shared/contracts';
import { assertOwnedPath, safeJoin } from './paths';
import { redact, checkedProcess } from './process';
import { findExecutable } from './codex';
export async function verifyBundleFiles(files: readonly BundleFile[], cacheRoot: string, ownedRoot: string): Promise<{status:'passed'|'failed'; checkedFiles:number; problems:string[]}> {
  const problems: string[] = []; let checkedFiles = 0;
  try { await assertOwnedPath(ownedRoot,cacheRoot); }
  catch (error) { return { status:'failed',checkedFiles,problems:[redact((error as Error).message)] }; }
  for (const file of files) {
    try {
      const path = safeJoin(cacheRoot,file.path); await assertOwnedPath(ownedRoot,path);
      const info = await stat(path);
      if (!info.isFile() || info.size !== file.data.length || info.size > 2 * 1024 * 1024) throw new Error('Tamanho ou tipo diferente do pacote esperado.');
      const hash = createHash('sha256').update(await readFile(path)).digest('hex');
      if (hash !== file.sha256) throw new Error('Conteúdo diferente do pacote esperado.');
      checkedFiles++;
    } catch (error) { if (problems.length < 8) problems.push(file.path + ': ' + ((error as NodeJS.ErrnoException).code === 'ENOENT' ? 'arquivo ausente' : redact((error as Error).message))); }
  }
  return { status: checkedFiles === files.length && files.length > 0 ? 'passed' : 'failed',checkedFiles,problems };
}
export async function findPython(): Promise<{path?:string; version?:string}> {
  for (const name of ['python3','python','py']) {
    const path = await findExecutable(name); if (!path) continue;
    try {
      const result = await checkedProcess(path,name === 'py' ? ['-3','--version'] : ['--version'],{timeoutMs:3000,maxBytes:4096});
      const version = (result.stdout.toString() || result.stderr).trim();
      if (/^Python 3\./.test(version)) return {path,version};
    } catch {}
  }
  return {};
}
