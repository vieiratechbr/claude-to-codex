import { it, expect } from 'vitest';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { diagnoseCodex } from '../../src/core/codex';
import { CodexInstaller, saveBundle } from '../../src/core/installer';
import { OperationStore } from '../../src/core/store';
import { digest } from '../../src/core/conversion';
import type { ConversionBundle } from '../../src/shared/contracts';
it.skipIf(process.env.C2C_NATIVE_TEST !== '1')('instala, atualiza, recupera e remove usando o Codex real isolado', async () => {
  const diagnostic = await diagnoseCodex();
  expect(diagnostic.capabilities.pluginListJson).toBe(true);
  const personal = join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'config.toml');
  const original = await readFile(personal).catch(() => null);
  const root = await mkdtemp(join(tmpdir(), 'c2c-native-'));
  try {
    const dataRoot = process.platform === 'win32' ? join(root, 'data').toUpperCase() : join(root, 'data'); const home = join(root, 'home'); await mkdir(home);
    const store = new OperationStore(dataRoot);
    for (const id of ['native-one', 'native-two']) {
      const files = [
        { path: '.codex-plugin/plugin.json', data: Buffer.from(JSON.stringify({ name: 'c2c-native-fixture', version: '0.1.0', description: 'Artificial integration fixture', author: { name: 'Test' }, skills: './skills/' })) },
        { path: 'skills/hello/SKILL.md', data: Buffer.from('---\nname: hello\ndescription: Artificial test only\n---\n' + id) }
      ].map(f => ({ ...f, sha256: digest(f.data) }));
      await saveBundle(store, { id, pluginName: 'c2c-native-fixture', sourceCommit: 'a'.repeat(40), source: { url: 'https://github.com/acme/fixture.git' }, componentId: 'test', files, findings: [], installable: true } satisfies ConversionBundle);
    }
    const installer = new CodexInstaller({ dataRoot, codexPath: diagnostic.codexPath!, codexHome: home });
    const first = await installer.install('native-one'); expect(first.state, JSON.stringify(first.findings)).toBe('installed'); expect(first.recognized).toBe(true);
    const updated = await installer.update(first.installationId!, 'native-two'); expect(updated.state).toBe('updated');
    const restored = await installer.restore(updated.operationId); expect(restored.state).toBe('restored'); expect(restored.recognized).toBe(true);
    const removed = await installer.remove(first.installationId!); expect(removed.state).toBe('removed'); expect(removed.recognized).toBe(false);
    expect(await readFile(personal).catch(() => null)).toEqual(original);
  } finally { await rm(root, { recursive: true, force: true }); }
}, 120000);
