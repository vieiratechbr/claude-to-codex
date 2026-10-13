import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { lstat } from 'node:fs/promises';
export function safeRelativePath(input: string): string {
  if (!input || input.length > 220 || isAbsolute(input) || /[\\:\x00-\x1f<>|?*]/.test(input)) throw new Error('Caminho inválido: ' + input);
  for (const part of input.split('/')) {
    if (!part || part === '.' || part === '..' || part.toLowerCase() === '.git' || /[. ]$/.test(part) ||
      /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\.|$)/i.test(part)) throw new Error('Caminho não permitido: ' + input);
  }
  return input;
}
export function safeJoin(root: string, path: string): string {
  return join(root, ...safeRelativePath(path).split('/'));
}
export async function assertOwnedPath(root: string, target: string): Promise<void> {
  const base = resolve(root); const full = resolve(target); const rel = relative(base, full);
  if (rel.startsWith('..') || isAbsolute(rel) || !rel) throw new Error('Destino fora da área gerenciada.');
  let current = base;
  for (const segment of ['', ...rel.split(sep)]) {
    current = segment ? join(current, segment) : current;
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error('Link não permitido na área gerenciada.'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}
export function slug(input: string): string {
  const result = input.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return result && !/^(con|aux|nul|prn|com\d|lpt\d)$/.test(result) ? result : 'converted-plugin';
}
