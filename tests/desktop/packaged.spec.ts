import { test, expect, _electron } from '@playwright/test';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
test.skip(process.env.C2C_PACKAGED_TEST !== '1', 'Explicit packaged verification only');
test('abre o executável empacotado com ponte isolada e perfil temporário', async () => {
  await mkdir('.cache', { recursive: true });
  const root = await mkdtemp(join(process.cwd(), '.cache/packaged-'));
  const env: Record<string,string> = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string,string] => typeof entry[1] === 'string'));
  env.CLAUDE_TO_CODEX_HOME = root; env.CODEX_HOME = join(root, 'home'); delete env.ELECTRON_RUN_AS_NODE;
  const application = await _electron.launch({ executablePath: process.env.C2C_PACKAGED_EXE || join(process.cwd(), 'release/win-unpacked/Claude to Codex.exe'), env });
  try {
    const page = await application.firstWindow();
    await expect(page.getByLabel('Link do GitHub')).toBeVisible();
    expect(await application.evaluate(({ app }) => app.isPackaged)).toBe(true);
    expect(await application.evaluate(({ app }) => app.getVersion())).toBe('0.1.2-beta.1');
    expect(await application.evaluate(({ app }) => app.getPath('userData'))).toContain(root);
    expect(await page.evaluate(() => typeof (window as any).require)).toBe('undefined');
    expect(await page.evaluate(() => typeof (window as any).claudeToCodex.analyze)).toBe('function');
    await expect(page.getByText('Conectando ao seu ambiente…', { exact: true })).toHaveCount(0, { timeout: 30000 });
    await page.setViewportSize({ width: 1320, height: 900 });
    await page.screenshot({ path: 'test-results/packaged-window.png' });
    await page.setViewportSize({ width: 900, height: 680 });
    await page.getByText('Opções avançadas', { exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Referência')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Referência')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/packaged-small.png' });
  } finally { await application.close(); }
});
