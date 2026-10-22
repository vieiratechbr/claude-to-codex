import {afterEach,expect,it,vi} from 'vitest';
import {mkdtemp,mkdir,writeFile,readFile,lstat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createIsolatedCodexHome} from '../../src/core/isolated-codex-home';
const temporary:string[]=[];
afterEach(async()=>{for(const root of temporary.splice(0))await rm(root,{recursive:true,force:true});});
async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'c2c-auth-home-'));temporary.push(root);
  const sourceHome=join(root,'original'),operationRoot=join(root,'operation');await mkdir(sourceHome);await mkdir(operationRoot);
  await writeFile(join(sourceHome,'auth.json'),'SYNTHETIC_AUTH_FIXTURE_ONLY');
  await writeFile(join(sourceHome,'AGENTS.md'),'Private fixture instructions.');
  await writeFile(join(sourceHome,'config.toml'),'# Fixture configuration, never copied.');
  return{root,sourceHome,operationRoot};
}
it('copies only the opaque auth fixture into the operation home and preserves the original',async()=>{
  const f=await fixture(),auth=join(f.sourceHome,'auth.json'),before=createHash('sha256').update(await readFile(auth)).digest('hex');
  const validate=vi.fn(async(env:NodeJS.ProcessEnv)=>{expect(await readFile(join(env.CODEX_HOME!,'auth.json'),'utf8')).toBe('SYNTHETIC_AUTH_FIXTURE_ONLY');});
  const isolated=await createIsolatedCodexHome(f.operationRoot,{sourceHome:f.sourceHome,environment:{CODEX_HOME:f.sourceHome,CODEX_SQLITE_HOME:join(f.sourceHome,'private-database'),AUTH_BROKER_FIXTURE:'preserved'},codexPath:'unused',verifyAuthentication:validate});
  expect(isolated.env.CODEX_HOME).not.toBe(f.sourceHome);
  expect(isolated.env.CODEX_SQLITE_HOME).toBe(isolated.env.CODEX_HOME);
  expect(isolated.env.AUTH_BROKER_FIXTURE).toBe('preserved');
  await expect(lstat(join(isolated.env.CODEX_HOME!,'AGENTS.md'))).rejects.toMatchObject({code:'ENOENT'});
  await expect(lstat(join(isolated.env.CODEX_HOME!,'config.toml'))).rejects.toMatchObject({code:'ENOENT'});
  if(process.platform!=='win32')expect((await lstat(join(isolated.env.CODEX_HOME!,'auth.json'))).mode&0o777).toBe(0o600);
  await isolated.cleanup();await isolated.cleanup();
  await expect(lstat(join(isolated.env.CODEX_HOME!,'auth.json'))).rejects.toMatchObject({code:'ENOENT'});
  expect(createHash('sha256').update(await readFile(auth)).digest('hex')).toBe(before);
  expect(validate).toHaveBeenCalledTimes(1);
});
it('keeps inherited authentication paths when no file cache exists',async()=>{
  const f=await fixture();await rm(join(f.sourceHome,'auth.json'));
  const isolated=await createIsolatedCodexHome(f.operationRoot,{sourceHome:f.sourceHome,environment:{CODEX_API_KEY:'SYNTHETIC_ENV_FIXTURE_ONLY',OFFICIAL_BROKER_FIXTURE:'unchanged'},codexPath:'unused',verifyAuthentication:async env=>{expect(env.CODEX_API_KEY).toBe('SYNTHETIC_ENV_FIXTURE_ONLY');expect(env.OFFICIAL_BROKER_FIXTURE).toBe('unchanged');}});
  await expect(lstat(join(isolated.env.CODEX_HOME!,'auth.json'))).rejects.toMatchObject({code:'ENOENT'});await isolated.cleanup();
});
it('removes the credential copy when authentication validation fails without leaking its cause',async()=>{
  const f=await fixture();let temporaryAuth='';
  await expect(createIsolatedCodexHome(f.operationRoot,{sourceHome:f.sourceHome,environment:{},codexPath:'unused',verifyAuthentication:async env=>{temporaryAuth=join(env.CODEX_HOME!,'auth.json');throw Error('SYNTHETIC_SECRET_MUST_NOT_APPEAR');}})).rejects.toThrow(/login oficial/i);
  await expect(lstat(temporaryAuth)).rejects.toMatchObject({code:'ENOENT'});
  expect(await readFile(join(f.sourceHome,'auth.json'),'utf8')).toBe('SYNTHETIC_AUTH_FIXTURE_ONLY');
});
it('removes the copied credential if authentication preparation is cancelled',async()=>{
  const f=await fixture(),controller=new AbortController();let temporaryAuth='';
  await expect(createIsolatedCodexHome(f.operationRoot,{sourceHome:f.sourceHome,environment:{},codexPath:'unused',signal:controller.signal,verifyAuthentication:async env=>{temporaryAuth=join(env.CODEX_HOME!,'auth.json');controller.abort();throw Error('SYNTHETIC_PRIVATE_CAUSE');}})).rejects.toThrow(/cancelada/i);
  await expect(lstat(temporaryAuth)).rejects.toMatchObject({code:'ENOENT'});
  expect(await readFile(join(f.sourceHome,'auth.json'),'utf8')).toBe('SYNTHETIC_AUTH_FIXTURE_ONLY');
});
