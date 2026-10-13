// Opt-in integration QA. Requires network, a logged-in Codex, and Python 3.
// The pinned, reviewed search scripts run only after conversion and isolated installation.
import { _electron } from '@playwright/test';
import { build } from 'esbuild';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { validateDesignSearch } from './qa-design-results.mjs';
const run = promisify(execFile);
const commit = '7246805992a42b7bba37d4cac83b01416f0c6c44';
await mkdir('.cache', { recursive: true });
const root = await mkdtemp(join(process.cwd(), '.cache/uipro-assisted-'));
const config = join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'config.toml');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fingerprint = async () => { try { return hash(await readFile(config)); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };
const before = await fingerprint();
const report = { root, sourceCommit: commit, completed: false };
await build({ entryPoints: ['tests/helpers/real-repository-window.ts'], outfile: 'dist/main/real-repository-window.cjs', bundle: true, platform: 'node', format: 'cjs', target: 'node24', external: ['electron'] });
const env = { ...process.env, C2C_REAL_TEST_ROOT: root }; delete env.ELECTRON_RUN_AS_NODE;
const application = await _electron.launch({ args: ['dist/main/real-repository-window.cjs'], cwd: process.cwd(), env });
try {
  const page = await application.firstWindow();
  await page.getByLabel('Link do GitHub').waitFor();
  page.on('console', message => { if (message.text().startsWith('QA_PROGRESS ')) console.log(message.text()); });
  await page.evaluate(() => { window.__qaProgress = []; window.claudeToCodex.onProgress(p => { window.__qaProgress.push(p); console.log('QA_PROGRESS ' + JSON.stringify(p)); }); });
  await page.getByLabel('Link do GitHub').fill('https://github.com/nextlevelbuilder/ui-ux-pro-max-skill');
  await page.getByText('Opções avançadas', { exact: true }).click();
  await page.getByLabel('Referência').fill(commit);
  const started = Date.now();
  await page.getByRole('button', { name: 'Analisar repositório', exact: true }).click();
  console.log(JSON.stringify({ root, phase: 'real-analysis' }));
  await page.getByRole('heading', { name: 'Escolha os componentes' }).waitFor({ state: 'visible', timeout: 180000 });
  report.analysisMs = Date.now() - started;
  await page.screenshot({ path: join(root, 'selection.png') });
  const conversionStarted = Date.now();
  await page.getByRole('button', { name: 'Converter selecionados', exact: true }).click();
  await page.getByRole('heading', { name: 'Revise a conversão' }).waitFor({ state: 'visible', timeout: 2100000 });
  report.conversionMs = Date.now() - conversionStarted;
  const history = await page.evaluate(() => window.claudeToCodex.listHistory());
  const bundleRecord = history.find(h => h.kind === 'bundle');
  const bundle = await page.evaluate(id => window.claudeToCodex.reviewBundle(id), bundleRecord.id);
  await writeFile(join(root, 'bundle-view.json'), JSON.stringify(bundle, null, 2));
  await page.screenshot({ path: join(root, 'review.png') });
  report.installable = bundle.installable; report.files = bundle.files.length;
  report.findings = bundle.findings;
  console.log(JSON.stringify({ phase: 'review', installable: bundle.installable, files: bundle.files.length, blocking: bundle.findings.filter(f => f.severity === 'blocking') }));
  if (!bundle.installable) throw new Error('Real repository conversion blocked; inspect bundle-view.json.');
  await page.getByRole('button', { name: 'Instalar no Codex', exact: true }).click();
  await page.getByText('Instalação reconhecida pelo Codex.', { exact: true }).waitFor({ state: 'visible', timeout: 120000 });
  await page.screenshot({ path: join(root, 'installed.png') });
  report.recognized = true;
  const installed = join(root, 'marketplace/plugins', bundle.id);
  const analysisRecord = history.find(h => h.kind === 'analysis');
  const original = JSON.parse(await readFile(join(root, 'records', analysisRecord.id + '.json'), 'utf8')).data;
  const recordedBundle = JSON.parse(await readFile(join(root, 'records', bundle.id + '.json'), 'utf8')).data;
  const originalFiles = new Map(original.files.map(f => [f.path, f]));
  for (const file of recordedBundle.files.filter(f => f.path.startsWith('skills/ui-ux-pro-max/') && !f.path.endsWith('.md') || f.path === 'LICENSE')) {
    const source = originalFiles.get(file.sourcePath);
    if (!source || hash(Buffer.from(source.data, 'base64')) !== file.sha256) throw new Error('Conversion changed a resource: ' + file.path);
  }
  const script = join(installed, 'skills/ui-ux-pro-max/scripts/search.py');
  const python = process.env.C2C_QA_PYTHON || 'python';
  report.searches = [];
  for (const args of [
    ['SaaS dashboard analytics', '--design-system', '--json'],
    ['keyboard accessibility focus', '--domain', 'ux', '--json'],
    ['responsive form state accessibility', '--stack', 'react', '--json']
  ]) {
    const { stdout, stderr } = await run(python, ['-B', script, ...args], { cwd: root, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }, windowsHide: true, timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
    const result = JSON.parse(stdout);
    validateDesignSearch(result, args.includes('--design-system'));
    report.searches.push({ args, result, stderr });
  }
  // Verify preservation against the source hashes recorded in the converted bundle.
  report.preservedFiles = 0;
  for (const file of bundle.files.filter(f => f.path.startsWith('skills/ui-ux-pro-max/') && !f.path.endsWith('.md') || f.path === 'LICENSE')) {
    if (hash(await readFile(join(installed, file.path))) !== file.sha256) throw new Error('Installed file changed: ' + file.path);
    report.preservedFiles++;
  }
  report.personalConfigUnchanged = await fingerprint() === before;
  if (!report.personalConfigUnchanged) throw new Error('Personal Codex configuration changed.');
  report.completed = true;
  report.progress = await page.evaluate(() => window.__qaProgress);
  console.log(JSON.stringify({ phase: 'passed', root, analysisMs: report.analysisMs, conversionMs: report.conversionMs, searches: report.searches.length, personalConfigUnchanged: true }));
} catch (error) {
  report.error = error.message; process.exitCode = 1;
  console.log(JSON.stringify({ root, error: error.message }));
  try {
    const page = await application.firstWindow();
    report.progress = await page.evaluate(() => window.__qaProgress || []);
    if (report.progress.length) await page.evaluate(id => window.claudeToCodex.cancel(id), report.progress.at(-1).operationId);
  } catch { /* Retain the original failure if the renderer has already closed. */ }
} finally {
  report.personalConfigUnchanged = await fingerprint() === before;
  await writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2));
  await application.close();
}
