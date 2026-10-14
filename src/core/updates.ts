const REPOSITORY = 'https://github.com/vieiratechbr/claude-to-codex';
const RELEASES_API = 'https://api.github.com/repos/vieiratechbr/claude-to-codex/releases?per_page=20';
import type { AppUpdate } from '../shared/updates';
export type { AppUpdate } from '../shared/updates';
function versionParts(value: string) {
  if (value.length > 80) throw new Error('Versão inválida.');
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(value);
  if (!match) throw new Error('Versão inválida.');
  const pre = match[4]?.split('.');
  if (pre?.some(part => /^\d+$/.test(part) && part.length > 1 && part.startsWith('0'))) throw new Error('Versão inválida.');
  return { numbers: match.slice(1,4).map(BigInt), pre };
}
export function compareVersions(a: string, b: string): number {
  const left = versionParts(a); const right = versionParts(b);
  for (let i = 0; i < 3; i++) if (left.numbers[i] !== right.numbers[i]) return left.numbers[i] > right.numbers[i] ? 1 : -1;
  if (!left.pre || !right.pre) return left.pre === right.pre ? 0 : left.pre ? -1 : 1;
  for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i++) {
    const x = left.pre[i]; const y = right.pre[i];
    if (x === y) continue;
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    const nx = /^\d+$/.test(x); const ny = /^\d+$/.test(y);
    if (nx && ny) return BigInt(x) > BigInt(y) ? 1 : -1;
    if (nx !== ny) return nx ? -1 : 1;
    return x > y ? 1 : -1;
  }
  return 0;
}
export function isTrustedUpdateUrl(input: string): boolean {
  try {
    const url = new URL(input);
    if (url.origin !== 'https://github.com' || url.username || url.password || url.search || url.hash) return false;
    const base = '/vieiratechbr/claude-to-codex/releases/';
    if (!url.pathname.startsWith(base)) return false;
    const tail = url.pathname.slice(base.length);
    if (tail.startsWith('tag/v')) { versionParts(tail.slice(5)); return true; }
    const match = /^download\/v([^/]+)\/Claude-to-Codex-([^/]+)-Windows-x64-Setup\.exe$/.exec(tail);
    if (!match || match[1] !== match[2]) return false;
    versionParts(match[1]); return true;
  } catch { return false; }
}
async function boundedJson(response: Response): Promise<unknown> {
  if (!response.ok || !response.body) throw new Error('Consulta indisponível.');
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 1024 * 1024) throw new Error('Resposta excede o limite.');
      chunks.push(chunk.value);
    }
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString());
}
export async function checkForAppUpdates(installedVersion: string, fetcher: typeof fetch = fetch): Promise<AppUpdate> {
  const base = { installedVersion, checkedAt: new Date().toISOString() };
  try {
    versionParts(installedVersion);
    const response = await fetcher(RELEASES_API, { signal: AbortSignal.timeout(5000), redirect: 'error', headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'claude-to-codex/' + installedVersion } });
    const data = await boundedJson(response);
    if (!Array.isArray(data) || data.length > 20) throw new Error('Lista de releases inválida.');
    const releases: { version: string; releaseUrl: string; downloadUrl: string }[] = [];
    for (const entry of data) {
      if (!entry || entry.draft !== false || typeof entry.tag_name !== 'string' || !entry.tag_name.startsWith('v') || !Array.isArray(entry.assets)) continue;
      const version = entry.tag_name.slice(1);
      try { versionParts(version); } catch { continue; }
      const releaseUrl = `${REPOSITORY}/releases/tag/v${version}`;
      if (entry.html_url !== releaseUrl || !isTrustedUpdateUrl(releaseUrl)) continue;
      const name = `Claude-to-Codex-${version}-Windows-x64-Setup.exe`;
      const downloadUrl = `${REPOSITORY}/releases/download/v${version}/${name}`;
      if (!isTrustedUpdateUrl(downloadUrl) || !entry.assets.some((a: any) => a?.name === name && a.browser_download_url === downloadUrl)) continue;
      releases.push({ version, releaseUrl, downloadUrl });
    }
    releases.sort((a,b) => compareVersions(b.version,a.version));
    const latest = releases[0];
    if (!latest) return { ...base, status: 'unavailable', message: 'Não foi encontrada uma release Windows válida. Você pode continuar usando o aplicativo.' };
    return { ...base, status: compareVersions(latest.version, installedVersion) > 0 ? 'available' : 'current', latestVersion: latest.version, releaseUrl: latest.releaseUrl, downloadUrl: latest.downloadUrl, message: compareVersions(latest.version, installedVersion) > 0 ? 'Uma nova versão está disponível para Windows.' : 'Nenhuma versão Windows mais recente publicada.' };
  } catch { return { ...base, status: 'unavailable', message: 'Não foi possível consultar atualizações. Confira a conexão e tente novamente; a conversão continua disponível.' }; }
}
