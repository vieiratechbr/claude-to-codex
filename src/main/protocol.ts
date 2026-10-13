import { safeJoin } from '../core/paths';
export function resolveAppResource(input: string, root: string): string {
  if (/\/(?:\.\.|%2e)/i.test(input)) throw new Error('Recurso inválido.');
  const url = new URL(input);
  if (url.protocol !== 'app:' || url.hostname !== 'local' || url.username || url.password || url.port) throw new Error('Origem inválida.');
  const path = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html';
  return safeJoin(root, path);
}
export function isTrustedSender(frame: { url: string }|null|undefined, expected: { url: string }|null|undefined): boolean {
  if (!frame || frame !== expected) return false;
  try { const url = new URL(frame.url); return url.protocol === 'app:' && url.hostname === 'local' && !url.username && !url.password; } catch { return false; }
}
