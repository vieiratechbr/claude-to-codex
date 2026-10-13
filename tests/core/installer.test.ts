import { expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OperationStore } from '../../src/core/store';
import { CodexInstaller, saveBundle } from '../../src/core/installer';
import { digest } from '../../src/core/conversion';
import type { ConversionBundle } from '../../src/shared/contracts';
function bundle(id: string): ConversionBundle {
  const files = [
    { path: '.codex-plugin/plugin.json', data: Buffer.from(JSON.stringify({ name: 'fixture', version: id, description: 'Fixture', author: { name: 'Fixture' }, skills: './skills/' })) },
    { path: 'skills/hello/SKILL.md', data: Buffer.from('---\nname: hello\ndescription: Fixture\n---\nOi ' + id) }
  ].map(f => ({ ...f, sha256: digest(f.data) }));
  return { id, pluginName: 'fixture', sourceCommit: 'a'.repeat(40), source: { url: 'https://github.com/acme/fixture.git' }, componentId: 'fixture-component', files, findings: [], installable: true };
}
it('instala, detecta duplicata, atualiza, recupera e preserva mudanças externas', async () => {
  const root = await mkdtemp(join(tmpdir(), 'c2c-install-')); const home = join(root, 'codex'); await mkdir(home);
  try {
    const config = join(home, 'config.toml'); await writeFile(config, '# original\n');
    let active: string|undefined;
    const run = async (args: string[]): Promise<any> => {
      if (args.includes('marketplace')) { await writeFile(config, '# original\n[marketplaces.claude-to-codex-local]\nsource_type="local"\n'); return { marketplaceName: 'claude-to-codex-local', installedRoot: join(root, 'data/marketplace') }; }
      if (args.includes('add')) { active = 'fixture'; await writeFile(config, '# original\n[marketplaces.claude-to-codex-local]\nsource_type="local"\n[plugins."fixture@claude-to-codex-local"]\nenabled=true\n'); return { pluginId: 'fixture@claude-to-codex-local', name: 'fixture', marketplaceName: 'claude-to-codex-local', installedPath: join(home, 'fixture'), version: 'one', authPolicy: 'ON_INSTALL' }; }
      if (args.includes('remove')) { active = undefined; await writeFile(config, '# original\n[marketplaces.claude-to-codex-local]\nsource_type="local"\n'); return { success: true }; }
      return { installed: active ? [{ pluginId: 'fixture@claude-to-codex-local', name: 'fixture', marketplaceName: 'claude-to-codex-local', installed: true, enabled: true, version: 'one', source: { source: 'local', path: join(root, 'data/marketplace/plugins/one') }, installPolicy: 'AVAILABLE', authPolicy: 'ON_INSTALL' }] : [], available: [] };
    };
    const dataRoot = join(root, 'data'); const store = new OperationStore(dataRoot);
    await saveBundle(store, bundle('one')); await saveBundle(store, bundle('two'));
    const installer = new CodexInstaller({ dataRoot, codexPath: 'fixture', codexHome: home, run });
    const installed = await installer.install('one');
    expect(installed.recognized).toBe(true);
    await expect(installer.install('one')).rejects.toThrow(/instalad/i);
    const update = await installer.update(installed.installationId!, 'two');
    expect(update.state).toBe('updated');
    expect((await installer.restore(update.operationId)).state).toBe('restored');
    const removal = await installer.remove(installed.installationId!);
    await writeFile(config, (await readFile(config, 'utf8')) + '# usuário\n');
    expect((await installer.restore(removal.operationId)).state).toBe('conflict');
    expect(await readFile(config, 'utf8')).toContain('# usuário');
  } finally { await rm(root, { recursive: true, force: true }); }
});
it('recusa bundle adulterado antes de alterar o Codex', async () => {
  const root = await mkdtemp(join(tmpdir(), 'c2c-integrity-'));
  try {
    const store = new OperationStore(root); const bad = bundle('bad'); bad.files[0].data = Buffer.from('alterado');
    await saveBundle(store, bad);
    const installer = new CodexInstaller({ dataRoot: root, codexPath: 'unused', codexHome: join(root, 'home') });
    await expect(installer.install('bad')).rejects.toThrow();
  } finally { await rm(root, { recursive: true, force: true }); }
});
it('recupera lock de processo encerrado e restaura uma falha parcial', async () => {
  const root = await mkdtemp(join(tmpdir(), 'c2c-interrupted-')); const dataRoot = join(root, 'data'); const home = join(root, 'home');
  await mkdir(home); await mkdir(dataRoot);
  try {
    const config = join(home, 'config.toml'); await writeFile(config, '# original\n');
    await writeFile(join(dataRoot, 'installation-lock'), '2147480000');
    const store = new OperationStore(dataRoot); await saveBundle(store, bundle('broken'));
    const run = async (args: string[]): Promise<any> => {
      if (args.includes('marketplace')) { await writeFile(config, '# original\n[marketplaces.claude-to-codex-local]\nsource_type="local"\n'); return {}; }
      if (args.includes('add')) throw new Error('falha de fixture');
      return { installed: [], available: [] };
    };
    const installer = new CodexInstaller({ dataRoot, codexHome: home, codexPath: 'fixture', run });
    expect((await installer.install('broken')).state).toBe('failed');
    expect(await readFile(config, 'utf8')).toBe('# original\n');
    expect((await new OperationStore(dataRoot).list()).some(r => r.kind === 'transaction' && r.state === 'restored')).toBe(true);
  } finally { await rm(root, { recursive: true, force: true }); }
});
it('preserva edição externa durante falha de instalação', async () => {
  const root = await mkdtemp(join(tmpdir(), 'c2c-race-')); const home = join(root, 'home'); await mkdir(home);
  try {
    const config = join(home, 'config.toml'); await writeFile(config, '# original\n');
    const store = new OperationStore(join(root, 'data')); await saveBundle(store, bundle('race'));
    const run = async (args: string[]): Promise<any> => {
      if (args.includes('marketplace')) { await writeFile(config, '# original\n[marketplaces.claude-to-codex-local]\nsource_type="local"\n'); return {}; }
      if (args.includes('add')) { await writeFile(config, (await readFile(config, 'utf8')) + '\n[preferences]\nlanguage="pt-BR"\n# alteração externa\n'); throw new Error('native failure'); }
      return { installed: [], available: [] };
    };
    const result = await new CodexInstaller({ dataRoot: join(root, 'data'), codexHome: home, codexPath: 'fixture', run }).install('race');
    expect(result.findings.some(f => f.code === 'recovery-conflict')).toBe(true);
    expect(await readFile(config, 'utf8')).toContain('language="pt-BR"');
  } finally { await rm(root, { recursive: true, force: true }); }
});
it('preserva edição externa inserida durante recuperação', async () => {
  const root = await mkdtemp(join(tmpdir(), 'c2c-recover-race-')); const home = join(root, 'home'); await mkdir(home);
  try {
    const config = join(home, 'config.toml'); await writeFile(config, '# original\n'); let active = false;
    const run = async (args: string[]): Promise<any> => {
      if (args.includes('marketplace')) { await writeFile(config, '# original\n[marketplaces.claude-to-codex-local]\nsource_type="local"\n'); return {}; }
      if (args.includes('add')) { active = true; await writeFile(config, (await readFile(config, 'utf8')) + '\n[plugins."fixture@claude-to-codex-local"]\nenabled=true\n'); return {}; }
      if (args.includes('remove')) { active = false; await writeFile(config, (await readFile(config, 'utf8')) + '\n[preferences]\nlanguage="pt-BR"\n'); return {}; }
      return { installed: active ? [{ pluginId: 'fixture@claude-to-codex-local', installed: true }] : [] };
    };
    const dataRoot = join(root, 'data'); const store = new OperationStore(dataRoot); await saveBundle(store, bundle('recover-race'));
    const installer = new CodexInstaller({ dataRoot, codexHome: home, codexPath: 'fixture', run }); const installed = await installer.install('recover-race');
    expect((await installer.restore(installed.operationId)).state).toBe('conflict');
    expect(await readFile(config, 'utf8')).toContain('language="pt-BR"');
  } finally { await rm(root, { recursive: true, force: true }); }
});
