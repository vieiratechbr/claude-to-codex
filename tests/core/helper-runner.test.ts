import {expect,it} from 'vitest';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join,isAbsolute} from 'node:path';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {HELPER_RUNNER_SOURCE} from '../../src/core/helper-runner';
import {findExecutable} from '../../src/core/codex';
async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'c2c-helper-runner-')),bundle=join(root,'package'),project=join(root,'projeto com espaços'),dir=join(bundle,'codex-compat');await mkdir(dir,{recursive:true});await mkdir(project);
  const script='printf "%s\\n" "$C2C_PROJECT_ROOT" "$1"\nprobe() { printf "function:%s" "$1"; }\n';
  await mkdir(join(bundle,'scripts'));await writeFile(join(bundle,'scripts','probe.sh'),script);await writeFile(join(dir,'run-helper.py'),HELPER_RUNNER_SOURCE);
  await writeFile(join(dir,'scripts.json'),JSON.stringify({'scripts/probe.sh':createHash('sha256').update(script).digest('hex')}));
  const python=await findExecutable('python');if(!python)throw new Error('Python required for generated helper runner QA');
  const run=(args:string[],input?:string,environment:NodeJS.ProcessEnv={})=>spawnSync(python,[join(dir,'run-helper.py'),...args],{encoding:'utf8',windowsHide:true,cwd:root,input,env:{...process.env,...environment}});
  return{root,bundle,project,run};
}
it('exige projeto explícito em vez de executar no diretório instalado',async()=>{
  const f=await fixture();try{expect(f.run(['--script','scripts/probe.sh']).status).toBe(2);expect(f.run(['--project',f.bundle,'--script','scripts/probe.sh']).status).toBe(2);}finally{await rm(f.root,{recursive:true,force:true,maxRetries:5});}
});
it('encaminha argumentos literais e diretório de projeto ao helper convertido',async()=>{
  const f=await fixture();try{const value='literal $() & spaces';const result=f.run(['--project',f.project,'--script','scripts/probe.sh','--',value]);expect(result.status,JSON.stringify(result)).toBe(0);expect(result.stdout.replace(/\\/g,'/').trim().split(/\r?\n/).at(-1),JSON.stringify(result)).toBe(value);expect(result.stdout).toContain('projeto com espaços');}finally{await rm(f.root,{recursive:true,force:true,maxRetries:5});}
});
it('rejeita código fora do manifesto e alterações no helper após conversão',async()=>{
  const f=await fixture();try{expect(f.run(['--project',f.project,'--script','../outside.sh']).status).toBe(2);await writeFile(join(f.bundle,'scripts/probe.sh'),'exit 0');expect(f.run(['--project',f.project,'--script','scripts/probe.sh']).status).toBe(2);}finally{await rm(f.root,{recursive:true,force:true,maxRetries:5});}
});
it('chama função de biblioteca com argv sem avaliar o nome ou os argumentos',async()=>{
  const f=await fixture();try{const result=f.run(['--project',f.project,'--script','scripts/probe.sh','--function','probe','--','hello world']);expect(result.status,JSON.stringify(result)).toBe(0);expect(result.stdout).toContain('function:hello world');expect(f.run(['--project',f.project,'--script','scripts/probe.sh','--function','probe; touch x']).status).toBe(2);}finally{await rm(f.root,{recursive:true,force:true,maxRetries:5});}
});
it('encaminha stdin JSON completo ao helper sem consumi-lo na descoberta do Bash',async()=>{
  const f=await fixture();try{
    const script='cat > payload.json\ncat payload.json\n';
    await writeFile(join(f.bundle,'scripts/probe.sh'),script);
    await writeFile(join(f.bundle,'codex-compat/scripts.json'),JSON.stringify({'scripts/probe.sh':createHash('sha256').update(script).digest('hex')}));
    const payload=JSON.stringify({session_id:'sessão de teste',tool_input:{file_path:'assets/data/nome com espaços.json',command:'literal $(touch must-not-run) & "quotes"'},message:'linha 1\nlinha 2'},null,2)+'\n';
    const result=f.run(['--project',f.project,'--script','scripts/probe.sh'],payload);
    expect(result.status,JSON.stringify(result)).toBe(0);expect(result.stdout).toBe(payload);
    expect(await readFile(join(f.project,'payload.json'),'utf8')).toBe(payload);
  }finally{await rm(f.root,{recursive:true,force:true,maxRetries:5});}
});
it('recusa builtins e executáveis que não sejam funções da biblioteca carregada',async()=>{
  const f=await fixture();try{
    const result=f.run(['--project',f.project,'--script','scripts/probe.sh','--function','eval','--','printf must-not-evaluate']);
    expect(result.status,JSON.stringify(result)).toBe(2);expect(result.stdout).not.toContain('must-not-evaluate');
    expect(f.run(['--project',f.project,'--script','scripts/probe.sh','--function','printf','--','must-not-call']).status).toBe(2);
  }finally{await rm(f.root,{recursive:true,force:true,maxRetries:5});}
});
it('recusa uma função exportada pelo ambiente que não pertence à biblioteca',async()=>{
  const f=await fixture();try{
    const result=f.run(['--project',f.project,'--script','scripts/probe.sh','--function','injected'],undefined,{'BASH_FUNC_injected%%':'() { printf inherited-not-package; }'});
    expect(result.status,JSON.stringify(result)).toBe(2);expect(result.stdout).not.toContain('inherited-not-package');
  }finally{await rm(f.root,{recursive:true,force:true,maxRetries:5});}
});
it('consulta runtimes absolutos verificados sem selecionar projeto nem executar helper',async()=>{
  const f=await fixture();try{
    const result=f.run(['--runtime-info']);expect(result.status,JSON.stringify(result)).toBe(0);
    const info=JSON.parse(result.stdout) as {bash:string;python:string};
    for(const path of [info.bash,info.python]){expect(isAbsolute(path)).toBe(true);expect(existsSync(path)).toBe(true);}
    const version=spawnSync(info.bash,['--version'],{encoding:'utf8',windowsHide:true});expect(version.status).toBe(0);expect(version.stdout).toContain('GNU bash');
    const python=spawnSync(info.python,['-c','import sys; print(sys.version_info[0])'],{encoding:'utf8',windowsHide:true});expect(python.status).toBe(0);expect(python.stdout.trim()).toBe('3');
  }finally{await rm(f.root,{recursive:true,force:true,maxRetries:5});}
});
it('ignora BASH_ENV do chamador na consulta de runtime e execução do helper',async()=>{
  const f=await fixture();try{
    const poison=join(f.root,'caller startup.sh'),marker=join(f.project,'startup-must-not-run');
    await writeFile(poison,'printf poisoned > "'+marker.replace(/\\/g,'/')+'"\n');
    const environment={BASH_ENV:poison,ENV:poison};
    expect(f.run(['--runtime-info'],undefined,environment).status).toBe(0);
    const result=f.run(['--project',f.project,'--script','scripts/probe.sh','--function','probe','--','ok'],undefined,environment);
    expect(result.status,JSON.stringify(result)).toBe(0);expect(result.stdout).toContain('function:ok');expect(existsSync(marker)).toBe(false);
  }finally{await rm(f.root,{recursive:true,force:true,maxRetries:5});}
});
it('usa o Bash verificado em chamadas aninhadas mesmo quando o runtime se chama sh.exe',async()=>{
  const f=await fixture();try{
    const info=JSON.parse(f.run(['--runtime-info']).stdout) as {bash:string};
    const shadow=join(f.root,'untrusted path');await mkdir(shadow);
    await writeFile(join(shadow,'bash'),'exit 93\n');
    const script='bash "$C2C_RESOURCE_ROOT/scripts/child.sh" "$1"\n';
    await writeFile(join(f.bundle,'scripts/probe.sh'),script);
    await writeFile(join(f.bundle,'scripts/child.sh'),'printf "%s\\n" "$1"\n');
    await writeFile(join(f.bundle,'codex-compat/scripts.json'),JSON.stringify({'scripts/probe.sh':createHash('sha256').update(script).digest('hex')}));
    const value='literal $() & ação';
    const result=f.run(['--project',f.project,'--script','scripts/probe.sh','--',value],undefined,{C2C_BASH:info.bash,PATH:shadow});
    expect(result.status,JSON.stringify(result)).toBe(0);expect(result.stdout.trim()).toBe(value);
  }finally{await rm(f.root,{recursive:true,force:true,maxRetries:5});}
});
