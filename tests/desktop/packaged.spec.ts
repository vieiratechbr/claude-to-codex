import { test, expect, _electron } from '@playwright/test';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
test.skip(process.env.C2C_PACKAGED_TEST !== '1', 'Explicit packaged verification only');
test('abre o executável empacotado com ponte isolada e perfil temporário', async () => {
  await mkdir('.cache', { recursive: true });
  const root = await mkdtemp(join(process.cwd(), '.cache/packaged-'));
  const env: Record<string,string> = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string,string] => typeof entry[1] === 'string'));
  env.CLAUDE_TO_CODEX_HOME = root; env.CODEX_HOME = join(root, 'home'); delete env.ELECTRON_RUN_AS_NODE;
  const application = await _electron.launch({ executablePath: join(process.cwd(), 'release/win-unpacked/Claude to Codex.exe'), env });
  try {
    const page = await application.firstWindow();
    await expect(page.getByLabel('Link do GitHub')).toBeVisible();
    expect(await application.evaluate(({ app }) => app.isPackaged)).toBe(true);
    expect(await application.evaluate(({ app }) => app.getPath('userData'))).toContain(root);
    expect(await page.evaluate(() => typeof (window as any).require)).toBe('undefined');
    expect(await page.evaluate(() => typeof (window as any).claudeToCodex.analyze)).toBe('function');
    await page.screenshot({ path: 'test-results/packaged-window.png' });
  } finally { await application.close(); }
});
