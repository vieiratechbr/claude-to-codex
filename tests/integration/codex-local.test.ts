import { it, expect } from 'vitest';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { diagnoseCodex } from '../../src/core/codex';
import { CodexInstaller, saveBundle } from '../../src/core/installer';
import { OperationStore } from '../../src/core/store';
import { convertComponents } from '../../src/core/conversion';
import { inventorySource } from '../../src/core/inventory';
import type { SourceSnapshot } from '../../src/shared/contracts';
it.skipIf(process.env.C2C_NATIVE_TEST !== '1')('instala, atualiza, recupera e remove usando o Codex real isolado', async () => {
  const personal = join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'config.toml');
  const original = await readFile(personal).catch(() => null);
  const diagnostic = await diagnoseCodex();
  expect(diagnostic.capabilities.pluginListJson).toBe(true);
  expect(await readFile(personal).catch(() => null)).toEqual(original);
  const root = await mkdtemp(join(tmpdir(), 'c2c-native-'));
  try {
    const dataRoot = process.platform === 'win32' ? join(root, 'data').toUpperCase() : join(root, 'data'); const home = join(root, 'home'); await mkdir(home);
    const store = new OperationStore(dataRoot);
    const bundleIds:string[]=[];
    for (const count of [2,3]) {
      const snapshot:SourceSnapshot={id:'native-'+count,request:{url:'https://github.com/acme/fixture.git'},commit:'a'.repeat(40),warnings:[],files:Array.from({length:count},(_,i)=>({path:'skills/hello-'+i+'/SKILL.md',mode:'100644',oid:'',data:Buffer.from('---\nname: hello-'+i+'\ndescription: Artificial test only\n---\nPortable '+count)}))};
      const [bundle]=await convertComponents(snapshot,inventorySource(snapshot).map(c=>c.id),{dataRoot,diagnostics:diagnostic,useCodex:false,asPackage:true});
      expect(bundle.installable).toBe(true);await saveBundle(store,bundle);bundleIds.push(bundle.id);
    }
    const installer = new CodexInstaller({ dataRoot, codexPath: diagnostic.codexPath!, codexHome: home });
    const first = await installer.install(bundleIds[0]); expect(first.state, JSON.stringify(first.findings)).toBe('installed'); expect(first.recognized).toBe(true);
    const verified=await installer.verify(first.installationId!);
    expect(verified.checks.filter(check => check.status !== 'passed')).toEqual([]);
    expect(verified.testPrompt).toContain('$acme-fixture');
    expect((await store.load(first.installationId!))!.data.componentIds).toHaveLength(2);
    const updated = await installer.update(first.installationId!, bundleIds[1]); expect(updated.state).toBe('updated');
    expect((await store.load(first.installationId!))!.data.componentIds).toHaveLength(3);
    expect((await installer.verify(first.installationId!)).checks.filter(check => check.status !== 'passed')).toEqual([]);
    const restored = await installer.restore(updated.operationId); expect(restored.state).toBe('restored'); expect(restored.recognized).toBe(true);
    expect((await store.load(first.installationId!))!.data.componentIds).toHaveLength(2);
    const removed = await installer.remove(first.installationId!); expect(removed.state).toBe('removed'); expect(removed.recognized).toBe(false);
    expect(await readFile(personal).catch(() => null)).toEqual(original);
  } finally { await rm(root, { recursive: true, force: true }); }
}, 120000);
