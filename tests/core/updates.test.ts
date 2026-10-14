import { expect, it } from 'vitest';
import { checkForAppUpdates, compareVersions, isTrustedUpdateUrl } from '../../src/core/updates';
const repo = 'https://github.com/vieiratechbr/claude-to-codex';
function release(version: string, changes: Record<string, unknown> = {}) {
  const tag = 'v' + version;
  const name = `Claude-to-Codex-${version}-Windows-x64-Setup.exe`;
  return { tag_name: tag, draft: false, html_url: `${repo}/releases/tag/${tag}`, assets: [{ name, browser_download_url: `${repo}/releases/download/${tag}/${name}` }], ...changes };
}
const response = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
it.each([
  ['0.2.0-beta.10', '0.2.0-beta.2', 1],
  ['0.2.0', '0.2.0-beta.10', 1],
  ['0.1.10', '0.1.9', 1],
  ['0.3.0-beta.1', '0.2.9', 1],
  ['0.2.0-beta.1', '0.2.0-beta.1', 0],
  ['0.2.0-beta.1', '0.2.0', -1]
])('compara %s e %s semanticamente', (a,b,expected) => expect(Math.sign(compareVersions(a,b))).toBe(expected));
it('encontra beta Windows mais recente sem depender da ordem da API', async () => {
  const result = await checkForAppUpdates('0.1.2-beta.2', response([release('0.2.0-beta.2'), release('0.2.0-beta.10'), release('0.1.1')]));
  expect(result.status).toBe('available');
  expect(result.latestVersion).toBe('0.2.0-beta.10');
  expect(result.downloadUrl).toContain('/v0.2.0-beta.10/Claude-to-Codex-0.2.0-beta.10-Windows-x64-Setup.exe');
});
it('ignora drafts e releases sem instalador correspondente da mesma origem', async () => {
  const result = await checkForAppUpdates('0.1.2-beta.2', response([
    release('9.0.0', { draft: true }), release('8.0.0', { assets: [] }),
    release('7.0.0', { html_url: 'https://example.org/release' }),
    release('6.0.0', { assets: [{ name: 'Claude-to-Codex-6.0.0-Windows-x64-Setup.exe', browser_download_url: 'https://example.org/setup.exe' }] }),
    release('0.2.0-beta.1')
  ]));
  expect(result.latestVersion).toBe('0.2.0-beta.1');
});
it('não anuncia atualização quando está na mesma versão ou à frente', async () => {
  expect((await checkForAppUpdates('0.2.0-beta.1', response([release('0.2.0-beta.1')]))).status).toBe('current');
  expect((await checkForAppUpdates('0.3.0-beta.1', response([release('0.2.0')]))).status).toBe('current');
});
it.each(['https://example.org/setup.exe', `${repo}/releases/download/v0.2.0/other.exe`, `${repo}/releases/download/v0.2.0/Claude-to-Codex-0.1.0-Windows-x64-Setup.exe`, `${repo}/releases/tag/v0.2.0?redirect=evil`, 'javascript:alert(1)', 'https://github.com.evil.org/vieiratechbr/claude-to-codex/releases/tag/v0.2.0'])('recusa endereço de atualização inesperado %s', url => expect(isTrustedUpdateUrl(url)).toBe(false));
it('aceita somente as páginas e instaladores esperados deste projeto', () => {
  expect(isTrustedUpdateUrl(`${repo}/releases/tag/v0.2.0-beta.1`)).toBe(true);
  expect(isTrustedUpdateUrl(`${repo}/releases/download/v0.2.0-beta.1/Claude-to-Codex-0.2.0-beta.1-Windows-x64-Setup.exe`)).toBe(true);
});
it('falha de rede ou resposta inválida não interrompe o aplicativo', async () => {
  expect((await checkForAppUpdates('0.2.0-beta.1', (async () => { throw new Error('offline'); }) as typeof fetch)).status).toBe('unavailable');
  expect((await checkForAppUpdates('0.2.0-beta.1', response([], 403))).status).toBe('unavailable');
  expect((await checkForAppUpdates('0.2.0-beta.1', response({ secret: 'unexpected' }))).status).toBe('unavailable');
  expect((await checkForAppUpdates('0.2.0-beta.1', response('x'.repeat(2 * 1024 * 1024)))).status).toBe('unavailable');
});
