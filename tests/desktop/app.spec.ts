import { test, expect, _electron } from '@playwright/test';
import { build } from 'esbuild';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
test('fluxo completo na janela com origem artificial e Codex real isolado', async () => {
  await mkdir('.cache',{ recursive: true });
  const root = await mkdtemp(join(process.cwd(),'.cache/desktop-'));
  await build({ entryPoints: ['tests/helpers/desktop-fixture.ts'], outfile: 'dist/main/fixture.cjs', bundle: true, platform: 'node', format: 'cjs', target: 'node24', external: ['electron'] });
  const environment: Record<string,string> = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string,string] => typeof entry[1] === 'string'));
  environment.C2C_FIXTURE_ROOT = root; environment.CODEX_HOME = join(root,'codex-home'); delete environment.ELECTRON_RUN_AS_NODE;
  const application = await _electron.launch({ args: ['dist/main/fixture.cjs'], cwd: process.cwd(), env: environment });
  try {
    const page = await application.firstWindow();
    await page.getByLabel('Link do GitHub').fill('http://github.com/acme/fixture');
    await page.getByRole('button',{ name: 'Analisar repositório', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await page.getByLabel('Link do GitHub').fill('https://github.com/acme/fixture');
    await page.getByRole('button',{ name: 'Analisar repositório', exact: true }).click();
    await expect(page.getByRole('heading',{ name: 'Escolha os componentes' })).toBeVisible();
    await page.getByLabel('Usar o Codex na adaptação').uncheck();
    await page.getByRole('button',{ name: 'Converter selecionados', exact: true }).click();
    await expect(page.getByRole('heading',{ name: 'Revise a conversão' })).toBeVisible();
    await expect(page.getByText('Pronto para instalar',{ exact: true })).toBeVisible();
    await expect(page.locator('pre').first()).toContainText('Conteúdo artificial');
    expect(await page.evaluate(() => (window as any).sourceExecuted)).toBeUndefined();
    expect(await page.evaluate(() => typeof (window as any).require)).toBe('undefined');
    await page.screenshot({ path: 'test-results/conversion-review.png' });
    await page.getByRole('button',{ name: 'Instalar no Codex', exact: true }).click();
    await expect(page.getByText('Instalação reconhecida pelo Codex.',{ exact: true })).toBeVisible();
    await page.getByRole('button',{ name: 'Histórico', exact: true }).click();
    await expect(page.getByText('Instalado',{ exact: true })).toBeVisible();
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.screenshot({ path: 'test-results/history-small.png' });
  } finally { await application.close(); }
});
