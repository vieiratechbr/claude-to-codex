import { mkdir, readFile, readdir, rename, writeFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { assertOwnedPath } from './paths';
export interface OperationRecord { id: string; kind: 'analysis'|'bundle'|'installation'|'transaction'; state: string; createdAt: string; title: string; data: any }
export async function atomicWrite(path: string, content: string|Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true }); const temporary = path + '.tmp-' + randomUUID();
  await writeFile(temporary, content, { mode: 0o600 }); await rename(temporary, path);
}
export class OperationStore {
  constructor(public root: string) {}
  private path(id: string): string {
    if (!/^[a-zA-Z0-9-]{1,100}$/.test(id)) throw new Error('Identificador inválido.');
    return join(this.root, 'records', id + '.json');
  }
  async save(record: OperationRecord): Promise<void> {
    const file = this.path(record.id); await assertOwnedPath(this.root, file);
    await atomicWrite(file, JSON.stringify(record));
  }
  async load(id: string): Promise<OperationRecord|undefined> {
    const file = this.path(id); await assertOwnedPath(this.root, file);
    try {
      if ((await stat(file)).size > 128 * 1024 * 1024) throw new Error('Registro excede o limite.');
      const record = JSON.parse(await readFile(file, 'utf8')) as OperationRecord;
      if (record.id !== id || !['analysis','bundle','installation','transaction'].includes(record.kind) || typeof record.title !== 'string') throw new Error('Registro inválido.');
      return record;
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
  }
  async list(): Promise<OperationRecord[]> {
    let names: string[]; try { names = await readdir(join(this.root, 'records')); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
    const records: OperationRecord[] = [];
    for (const name of names.filter(name => /^[a-zA-Z0-9-]+\.json$/.test(name))) { const record = await this.load(name.slice(0,-5)); if (record) records.push(record); }
    return records.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  }
}
