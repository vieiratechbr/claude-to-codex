import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { verifyBundleFiles } from '../../src/core/verification';
import { CodexInstaller, saveBundle } from '../../src/core/installer';
import { OperationStore } from '../../src/core/store';
import type { ConversionBundle } from '../../src/shared/contracts';
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root,{ recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(),'c2c-verify-')); roots.push(root);
  const owned = join(root,'cache'); const cache = join(owned,'plugin','0.1.0');
  await mkdir(join(cache,'skills','demo','scripts'),{ recursive: true });
  const data = Buffer.from('raise Exception("this script must never be executed")');
  const file = { path: 'skills/demo/scripts/search.py', data, sha256: createHash('sha256').update(data).digest('hex') };
  await writeFile(join(cache,file.path),data);
  return { root, owned, cache, file };
}
it('verifica hashes de arquivos no cache nativo sem executar seu conteúdo', async () => {
  const {owned,cache,file} = await fixture();
  const result = await verifyBundleFiles([file],cache,owned);
  expect(result).toMatchObject({ status: 'passed', checkedFiles: 1, problems: [] });
  expect(await readFile(join(cache,file.path))).toEqual(file.data);
});
it('identifica arquivo alterado e arquivo ausente', async () => {
  const {owned,cache,file} = await fixture();
  await writeFile(join(cache,file.path),'changed');
  const result = await verifyBundleFiles([file,{...file,path:'missing.md'}],cache,owned);
  expect(result.status).toBe('failed'); expect(result.problems).toHaveLength(2);
  expect(result.problems.join(' ')).toContain(file.path); expect(result.problems.join(' ')).toContain('missing.md');
});
it('não lê caminhos fora do cache gerenciado', async () => {
  const {owned,cache,file,root} = await fixture();
  expect((await verifyBundleFiles([{...file,path:'../../../outside.md'}],cache,owned)).status).toBe('failed');
  expect((await verifyBundleFiles([file],join(root,'outside'),owned)).status).toBe('failed');
});
it('recusa redirecionamento do cache por link de diretório', async () => {
  const {owned,cache,file,root} = await fixture();
  const link = join(owned,'redirect');
  await symlink(cache,link,process.platform === 'win32' ? 'junction' : 'dir');
  const result = await verifyBundleFiles([file],link,owned);
  expect(result.status).toBe('failed');
  expect(result.problems.length).toBeGreaterThan(0);
});
it('confere ativação nativa e mantém registros e arquivos de configuração intactos', async () => {
  const {root,file} = await fixture(); const home = join(root,'home'); const dataRoot = join(root,'app');
  const cache = join(home,'plugins','cache','claude-to-codex-local','fixture','0.1.0');
  await mkdir(join(cache,'skills','demo','scripts'),{ recursive: true }); await writeFile(join(cache,file.path),file.data);
  const manifestData = Buffer.from('{"name":"fixture","version":"0.1.0"}');
  const skillData = Buffer.from('---\nname: advertised-demo\ndescription: Demo\n---\nRead scripts/search.py.');
  await writeFile(join(cache,'skills','demo','SKILL.md'),skillData);
  await mkdir(join(cache,'.codex-plugin')); await writeFile(join(cache,'.codex-plugin','plugin.json'),manifestData);
  const bundle: ConversionBundle = { id: 'bundle', pluginName: 'fixture', componentId: 'component', sourceCommit: 'a'.repeat(40), source: {url:'https://github.com/acme/fixture.git'}, installable:true, findings:[], files:[file,{path:'skills/demo/SKILL.md',data:skillData,sha256:createHash('sha256').update(skillData).digest('hex')},{path:'.codex-plugin/plugin.json',data:manifestData,sha256:createHash('sha256').update(manifestData).digest('hex')}] };
  const store = new OperationStore(dataRoot); await saveBundle(store,bundle);
  const record = { id:'install',kind:'installation' as const,state:'installed',title:'fixture',createdAt:new Date().toISOString(),data:{bundleId:'bundle'} };
  await store.save(record); await writeFile(join(home,'config.toml'),'# preserve this file');
  const native = { installed: [{ pluginId:'fixture@claude-to-codex-local',installed:true,enabled:false,version:'0.1.0',source:{source:'local',path:join(dataRoot,'marketplace','plugins','bundle')} }] };
  const installer = new CodexInstaller({dataRoot,codexHome:home,codexPath:'unused',run:async args => { expect(args).toEqual(['plugin','list','--marketplace','claude-to-codex-local','--json']); return native; }});
  const result = await installer.verify('install');
  expect(result.recognized).toBe(true); expect(result.enabled).toBe(false);
  expect(result.checks.find(check => check.key === 'enabled')?.status).toBe('failed');
  expect(result.checks.find(check => check.key === 'files')?.status).toBe('passed');
  expect(result.testPrompt).toContain('$advertised-demo');
  expect(await store.load('install')).toEqual(record);
  expect(await readFile(join(home,'config.toml'),'utf8')).toBe('# preserve this file');
  await expect(installer.verify('bundle')).rejects.toThrow(/instalação/i);
});
