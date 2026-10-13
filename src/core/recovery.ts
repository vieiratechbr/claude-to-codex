import { readFile, unlink, lstat } from 'node:fs/promises';
import { atomicWrite } from './store';
export async function snapshotFile(path: string): Promise<string|null> {
  try { if ((await lstat(path)).isSymbolicLink()) throw new Error('Arquivo de configuração não pode ser um link.'); return (await readFile(path)).toString('base64'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
export async function restoreFile(path: string, encoded: string|null): Promise<void> {
  if (encoded === null) { try { await unlink(path); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } }
  else await atomicWrite(path, Buffer.from(encoded, 'base64'));
}
