import {afterEach,expect,it,vi} from 'vitest';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {findPython} from '../../src/core/verification';
import {checkedProcess} from '../../src/core/process';
vi.mock('../../src/core/process',async original=>({...await original<typeof import('../../src/core/process')>(),checkedProcess:vi.fn()}));
let root:string|undefined;
afterEach(async()=>{vi.unstubAllEnvs();vi.mocked(checkedProcess).mockReset();if(root)await rm(root,{recursive:true,force:true});root=undefined;});
async function setup(){root=await mkdtemp(join(tmpdir(),'c2c-python-'));vi.stubEnv('PATH','');vi.stubEnv('USERPROFILE',root);vi.stubEnv('LOCALAPPDATA',join(root,'local'));vi.stubEnv('SystemRoot',join(root,'system'));return root;}
it.skipIf(process.platform!=='win32')('detecta Python do runtime Codex sem executar scripts da skill',async()=>{
  const taskRoot=await setup();const executable=join(taskRoot,'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
  await mkdir(dirname(executable),{recursive:true});await writeFile(executable,'discovery fixture');
  vi.mocked(checkedProcess).mockImplementation(async(path,args)=>{expect(path).toBe(executable);expect(args).toEqual(['--version']);return{stdout:Buffer.from('Python 3.14.0'),stderr:'',exitCode:0};});
  expect(await findPython()).toEqual({path:executable,version:'Python 3.14.0'});
});
it.skipIf(process.platform!=='win32')('não aceita Python 2 como dependência pronta',async()=>{
  const taskRoot=await setup();const executable=join(taskRoot,'python.exe');await writeFile(executable,'discovery fixture');vi.stubEnv('PATH',taskRoot);
  vi.mocked(checkedProcess).mockResolvedValue({stdout:Buffer.from('Python 2.7.18'),stderr:'',exitCode:0});
  expect(await findPython()).toEqual({});
});
