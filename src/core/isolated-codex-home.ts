export interface IsolatedHomeOptions {
  sourceHome?: string;
  environment?: NodeJS.ProcessEnv;
  codexPath: string;
  signal?: AbortSignal;
  verifyAuthentication?: (env: NodeJS.ProcessEnv)=>Promise<void>;
}
export async function createIsolatedCodexHome(operationRoot:string,options:IsolatedHomeOptions):Promise<{env:NodeJS.ProcessEnv;cleanup:()=>Promise<void>}>{
  if(options.signal?.aborted)throw new Error('Operação cancelada.');
  const environment=options.environment??process.env;
  const sourceHome=resolve(options.sourceHome||environment.CODEX_HOME||join(homedir(),'.codex'));
  const home=await mkdtemp(join(operationRoot,'codex-home-'));await assertOwnedPath(operationRoot,home);
  const auth=join(home,'auth.json');const env:NodeJS.ProcessEnv={...environment,CODEX_HOME:home,CODEX_SQLITE_HOME:home};
  const cleanup=async()=>{
    try{await assertOwnedPath(operationRoot,auth);await unlink(auth);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw new Error('Não foi possível remover a credencial temporária do Codex. Confira a pasta isolada antes de continuar.');}
    try{await lstat(auth);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return;throw new Error('Não foi possível conferir a remoção da credencial temporária do Codex.');}
    throw new Error('A credencial temporária do Codex ainda existe após a limpeza.');
  };
  try{
    const source=join(sourceHome,'auth.json');let exists=false;
    try{const state=await lstat(source);if(!state.isFile()||state.isSymbolicLink())throw new Error('Invalid official auth cache.');exists=true;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    // Copy through the filesystem without parsing, logging or exporting tokens.
    if(exists){await copyFile(source,auth,constants.COPYFILE_EXCL);await chmod(auth,0o600);}
    if(options.verifyAuthentication)await options.verifyAuthentication(env);
    else if(!env.CODEX_API_KEY&&!env.OPENAI_API_KEY)await checkedProcess(options.codexPath,['login','status'],{env,signal:options.signal,timeoutMs:15000,maxBytes:64*1024});
    return{env,cleanup};
  }catch{
    await cleanup();
    if(options.signal?.aborted)throw new Error('Operação cancelada.');
    throw new Error('Não foi possível reutilizar o login oficial no ambiente isolado. Entre no Codex; credenciais do keyring não são exportadas.');
  }
}
import {constants} from 'node:fs';
import {mkdtemp,copyFile,chmod,lstat,unlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {assertOwnedPath} from './paths';
import {checkedProcess} from './process';
