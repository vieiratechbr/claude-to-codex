import {expect,it} from 'vitest';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {digest} from '../../src/core/conversion';
import {prepareWorkflowResources} from '../../src/core/workflow-resources';
import {adaptProjectScripts} from '../../src/core/script-portability';
import {claudeSyntaxMarkers} from '../../src/core/adapters/skills';
import {findExecutable} from '../../src/core/codex';
import type {BundleFile,Finding,SourceSnapshot} from '../../src/shared/contracts';
import type {WorkflowPortabilityOptions} from '../../src/core/workflow-portability';
function fixture(){
  const originals={'.claude/skills/probe/SKILL.md':'---\nname: probe\ndescription: Test project\n---\n!`bash "${CLAUDE_SKILL_DIR}/../../hooks/probe.sh"`\nUse this result before continuing.'};
  const helper='#!/bin/bash\ncd "$(dirname "$0")/../.."\nprintf "%s" "$PWD" > probe-result.txt\n';
  const snapshot:SourceSnapshot={id:'port',request:{url:'https://github.com/acme/studio'},commit:'a'.repeat(40),warnings:[],files:[{path:'.claude/skills/probe/SKILL.md',data:Buffer.from(originals['.claude/skills/probe/SKILL.md']),mode:'100644',oid:''},{path:'.claude/hooks/probe.sh',data:Buffer.from(helper),mode:'100644',oid:''}]};
  const files=new Map<string,BundleFile>();const put=(path:string,data:string|Buffer,sourcePath?:string)=>{const bytes=Buffer.isBuffer(data)?data:Buffer.from(data);files.set(path,{path,data:bytes,sha256:digest(bytes),sourcePath:sourcePath||files.get(path)?.sourcePath});};
  put('skills/probe/SKILL.md',snapshot.files[0].data,snapshot.files[0].path);put('source-context/.claude/hooks/probe.sh',snapshot.files[1].data,snapshot.files[1].path);
  return{snapshot,files,put};
}
it('converte o fechamento operacional sem executar documentos históricos ou fixtures de avaliação',()=>{
 const f=fixture();
 const sources:Record<string,string>={
  '.claude/docs/coordination.md':'Use Claude Code with its required native session mechanism.',
  'UPGRADING.md':'Historical rename: call /obsolete-command.',
  '.claude/docs/unrelated-setup.md':'Install Claude Code and configure its host.',
  'test-kit/catalog.yaml':'skills:\n  - name: probe\n    spec: test-kit/spec.md\n',
  'test-kit/spec.md':'Negative fixture: read `.claude/skills/some-skill/SKILL.md`. Check the source model and tool API.'
 };
 for(const [path,text]of Object.entries(sources)){f.snapshot.files.push({path,data:Buffer.from(text),mode:'100644',oid:''});f.put('source-context/'+path,text,path);}
 const entry=f.files.get('skills/probe/SKILL.md')!;
 f.put(entry.path,entry.data.toString()+'\nRead `.claude/docs/coordination.md` and `test-kit/catalog.yaml`. Consult `UPGRADING.md` for source history.',entry.sourcePath);
 const contexts=new Map<string,WorkflowPortabilityOptions>();const findings:Finding[]=[];
 const pending=prepareWorkflowResources(f.snapshot,f.files,f.put,findings,contexts);
 expect(pending.has('source-context/.claude/docs/coordination.md')).toBe(true);
 for(const path of ['source-context/UPGRADING.md','source-context/.claude/docs/unrelated-setup.md','source-context/test-kit/spec.md']){expect(pending.has(path),path).toBe(false);expect(contexts.has(path),path).toBe(false);}
 expect(f.files.get('source-context/test-kit/spec.md')!.data.toString()).toBe(sources['test-kit/spec.md']);
 expect(f.files.has('codex-compat/evaluation.md')).toBe(true);
});
it('mantém entradas mutáveis no projeto mesmo quando a origem inclui exemplos com o mesmo caminho',()=>{
 const {snapshot,files,put}=fixture();
 snapshot.files.push({path:'design/registry/entities.yaml',data:Buffer.from('example: true'),mode:'100644',oid:''});
 put('source-context/design/registry/entities.yaml','example: true','design/registry/entities.yaml');
 const skill=files.get('skills/probe/SKILL.md')!;
 put(skill.path,skill.data.toString()+'\nRead current `design/registry/entities.yaml` before updating it.',skill.sourcePath);
 prepareWorkflowResources(snapshot,files,put,[]);
 expect(files.get(skill.path)!.data.toString()).toContain('current `design/registry/entities.yaml`');
 expect(files.get(skill.path)!.data.toString()).not.toContain('current `source-context/design/');
});
it('usa o runner em chamadas literais de Bash inclusive em exemplos de fase e mantém seus argumentos',()=>{
 const {snapshot,files,put}=fixture();const skill=files.get('skills/probe/SKILL.md')!;
 put(skill.path,'Run the phase helper:\n```sh\nbash .claude/hooks/probe.sh "project file.md" --dry-run\n```',skill.sourcePath);
 prepareWorkflowResources(snapshot,files,put,[]);
 const result=files.get(skill.path)!.data.toString();
 expect(result).toContain('--script "source-context/.claude/hooks/probe.sh" -- "project file.md" --dry-run');
 expect(result).not.toMatch(/\bbash\s+\$\{C2C_RESOURCE_ROOT\}/);
});
it.each(['ação.sh','helper com espaços.sh'])('resolve o caminho completo registrado com Unicode/espaços sem alterar argumentos: %s',name=>{
 const {snapshot,files,put}=fixture(),skill=files.get('skills/probe/SKILL.md')!;
 const source='.claude/scripts/'+name,target='source-context/'+source,helper='#!/bin/bash\nprintf "%s\\n" "$@"\n';
 snapshot.files.push({path:source,data:Buffer.from(helper),mode:'100644',oid:''});put(target,helper,source);
 const args=' "argumento ç com espaços" --dry-run';
 put(skill.path,'```sh\n'+[source,'"'+source+'"',"'"+source+"'"].map(path=>'bash '+path+args).join('\n')+'\n```',skill.sourcePath);
 prepareWorkflowResources(snapshot,files,put,[]);
 const text=files.get(skill.path)!.data.toString(),command='python "${C2C_RESOURCE_ROOT}/codex-compat/run-helper.py" --project "${C2C_PROJECT_ROOT}" --script "'+target+'" --'+args;
 expect(text.split(command)).toHaveLength(4);
 expect(text).not.toMatch(/\bbash\s/);
});
it('não converte substrings de caminhos Unicode nem extensões de um helper registrado',()=>{
 const {snapshot,files,put}=fixture(),skill=files.get('skills/probe/SKILL.md')!;
 const source='.claude/scripts/ação.sh',helper='#!/bin/bash\nprintf ok\n';
 snapshot.files.push({path:source,data:Buffer.from(helper),mode:'100644',oid:''});put('source-context/'+source,helper,source);
 const commands=['bash '+source+'.backup','bash '+source+'é','bash pré'+source,'bash "'+source+'.backup"'];
 put(skill.path,'```sh\n'+commands.join('\n')+'\n```',skill.sourcePath);
 prepareWorkflowResources(snapshot,files,put,[]);
 const text=files.get(skill.path)!.data.toString();
 for(const command of commands)expect(text).toContain(command);
 expect(text).not.toContain('run-helper.py" --project');
});
it('classifica dados do projeto relativamente ao plugin proprietário mais próximo em todas as raízes',()=>{
 const {snapshot,files,put}=fixture(),skill=files.get('skills/probe/SKILL.md')!,contexts=new Map<string,WorkflowPortabilityOptions>();
 const add=(path:string,data:string)=>{snapshot.files.push({path,data:Buffer.from(data),mode:'100644',oid:''});put('source-context/'+path,data,path);};
 for(const root of ['plugins/one','plugins/two','plugins/one/design/nested'])add(root+'/.claude-plugin/plugin.json',JSON.stringify({name:root.split('/').at(-1)}));
 const mutable=['design/rules.md','production/status.yaml','assets/atlas.png','src/player.gd','source/main.cs','scenes/main.tscn','addons/local/plugin.cfg','tests/probe.gd','docs/architecture/decisions.md','docs/registry/entities.yaml','docs/engine-reference/version.md','project.local.yaml','technical-preferences.md','.claude/technical-preferences.md'];
 const projects=['design/root.md',...['plugins/one','plugins/two','plugins/one/design/nested'].flatMap(root=>mutable.map(path=>root+'/'+path))];
 for(const path of projects)add(path,'project example');
 const resources=['plugins/one/.claude/docs/guide.md','plugins/two/references/guide.md','plugins/one/design/nested/.claude/docs/guide.md'];
 for(const path of resources)add(path,'resource');
 put(skill.path,[...projects,...resources].map(path=>'Read `'+path+'`.').join('\n'),skill.sourcePath);
 prepareWorkflowResources(snapshot,files,put,[],contexts);
 const text=files.get(skill.path)!.data.toString();
 for(const path of projects){expect(text).toContain('Read `'+path+'`.');expect(contexts.get(skill.path)!.projectPaths).toContain(path);}
 for(const path of resources){expect(text).toContain('Read `source-context/'+path+'`.');expect(contexts.get(skill.path)!.projectPaths).not.toContain(path);}
});
it('executa as chamadas convertidas Unicode/espaços com argv literal e efeitos só no projeto isolado',async()=>{
 const {snapshot,files,put}=fixture(),skill=files.get('skills/probe/SKILL.md')!,source='.claude/scripts/ação com espaços.sh';
 const helper='#!/bin/bash\nprintf "%s\\n" "$@" >> unicode-result.txt\n';
 snapshot.files.push({path:source,data:Buffer.from(helper),mode:'100644',oid:''});put('source-context/'+source,helper,source);
 const args=' "argumento ç com espaços" \'--literal=$HOME;$(printf injected)\'';
 put(skill.path,'```sh\n'+[source,'"'+source+'"',"'"+source+"'"].map(path=>'bash '+path+args).join('\n')+'\n```',skill.sourcePath);
 prepareWorkflowResources(snapshot,files,put,[]);
 const program=/```sh\n([\s\S]*?)\n```/.exec(files.get(skill.path)!.data.toString())![1];
 const root=await mkdtemp(join(tmpdir(),'c2c-unicode-'));try{
  const bundle=join(root,'pacote ç espaço'),project=join(root,'projeto ação');await mkdir(project);
  for(const file of files.values()){const path=join(bundle,file.path);await mkdir(dirname(path),{recursive:true});await writeFile(path,file.data);}
  await expect(readFile(join(project,'unicode-result.txt'))).rejects.toThrow();
  const python=await findExecutable('python');if(!python)throw new Error('Python required for helper QA');
  const runtime=spawnSync(python,[join(bundle,'codex-compat/run-helper.py'),'--runtime-info'],{encoding:'utf8',windowsHide:true});expect(runtime.status,runtime.stderr).toBe(0);
  const result=spawnSync(JSON.parse(runtime.stdout).bash,['--noprofile','--norc','-c',program],{cwd:project,env:{...process.env,C2C_PROJECT_ROOT:project,C2C_RESOURCE_ROOT:bundle},encoding:'utf8',windowsHide:true});
  expect(result.status,result.stderr).toBe(0);
  expect(await readFile(join(project,'unicode-result.txt'),'utf8')).toBe(('argumento ç com espaços\n--literal=$HOME;$(printf injected)\n').repeat(3));
  await expect(readFile(join(bundle,'unicode-result.txt'))).rejects.toThrow();
 }finally{await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});
it.each(['--script','-s'])('resolve o verificador externo do Godot fora do res:// do projeto em uso: %s',flag=>{
 const {snapshot,files,put}=fixture();const skill=files.get('skills/probe/SKILL.md')!;
 const source='.claude/scripts/check.gd',target='source-context/'+source;
 snapshot.files.push({path:source,data:Buffer.from('extends SceneTree'),mode:'100644',oid:''});put(target,'extends SceneTree',source);
 put(skill.path,'```sh\ngodot --headless --path "${C2C_PROJECT_ROOT}" '+flag+' res://.claude/scripts/check.gd -- res://src/player.gd\n```',skill.sourcePath);
 prepareWorkflowResources(snapshot,files,put,[]);
 expect(files.get(skill.path)!.data.toString()).toContain(flag+' "${C2C_RESOURCE_ROOT}/source-context/.claude/scripts/check.gd" -- res://src/player.gd');
});
it('ancora leituras de recursos e bibliotecas em exemplos shell mantendo arquivos do projeto relativos',()=>{
 const {snapshot,files,put}=fixture(),skill=files.get('skills/probe/SKILL.md')!;
 const source='.claude/docs/effects.md';snapshot.files.push({path:source,data:Buffer.from('config'),mode:'100644',oid:''});put('source-context/'+source,'config',source);
 put(skill.path,'```bash\nsource .claude/hooks/probe.sh && cat project.yaml\ngrep "pattern" .claude/docs/effects.md\n```',skill.sourcePath);
 prepareWorkflowResources(snapshot,files,put,[]);
 const text=files.get(skill.path)!.data.toString();
 expect(text).toContain('source "${C2C_RESOURCE_ROOT}/source-context/.claude/hooks/probe.sh" && cat project.yaml');
 expect(text).toContain('grep "pattern" "${C2C_RESOURCE_ROOT}/source-context/.claude/docs/effects.md"');
});
it('preserva execução de operandos literais entre aspas simples após ancorar o recurso',()=>{
 const {snapshot,files,put}=fixture(),skill=files.get('skills/probe/SKILL.md')!;
 const source='.claude/docs/guide.md';snapshot.files.push({path:source,data:Buffer.from('guide'),mode:'100644',oid:''});put('source-context/'+source,'guide',source);
 put(skill.path,"```sh\ncat '.claude/docs/guide.md'\nsource '.claude/hooks/probe.sh'\n```",skill.sourcePath);
 prepareWorkflowResources(snapshot,files,put,[]);
 const text=files.get(skill.path)!.data.toString();
 expect(text).toContain('cat "${C2C_RESOURCE_ROOT}/source-context/.claude/docs/guide.md"');
 expect(text).toContain('source "${C2C_RESOURCE_ROOT}/source-context/.claude/hooks/probe.sh"');
 expect(text).not.toContain("'\"${C2C_RESOURCE_ROOT}");
});
it('transforma preparação dinâmica em instrução explícita sem executar o helper durante conversão',async()=>{
  const f=fixture(),findings:Finding[]=[];adaptProjectScripts(f.files,f.put,findings);prepareWorkflowResources(f.snapshot,f.files,f.put,findings);
  const text=f.files.get('skills/probe/SKILL.md')!.data.toString();
  expect(claudeSyntaxMarkers(text)).toEqual([]);
  expect(text).toContain('Use this result before continuing.');
  expect(f.files.has('codex-compat/run-helper.py')).toBe(true);
  const root=await mkdtemp(join(tmpdir(),'c2c-workflow-resource-'));try{
    const bundle=join(root,'bundle'),project=join(root,'project target');await mkdir(project);
    for(const file of f.files.values()){const path=join(bundle,file.path);await mkdir(dirname(path),{recursive:true});await writeFile(path,file.data);}
    await expect(readFile(join(project,'probe-result.txt'))).rejects.toThrow();
    const python=await findExecutable('python');if(!python)throw new Error('Python required for helper QA');
    const result=spawnSync(python,[join(bundle,'codex-compat/run-helper.py'),'--project',project,'--script','source-context/.claude/hooks/probe.sh'],{encoding:'utf8',windowsHide:true});
    expect(result.status,result.stderr).toBe(0);expect((await readFile(join(project,'probe-result.txt'),'utf8')).replace(/\\/g,'/')).toMatch(/project target$/);
    await expect(readFile(join(bundle,'source-context/probe-result.txt'))).rejects.toThrow();
  }finally{await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});
it('mantém projeto e recursos separados também nos exemplos de bibliotecas',()=>{
  const f=fixture();f.put('skills/probe/SKILL.md','(cd "${CLAUDE_SKILL_DIR}/../../.." && source .claude/hooks/probe.sh && inspect_config)',f.snapshot.files[0].path);const findings:Finding[]=[];
  adaptProjectScripts(f.files,f.put,findings);prepareWorkflowResources(f.snapshot,f.files,f.put,findings);
  const text=f.files.get('skills/probe/SKILL.md')!.data.toString();expect(text).not.toContain('CLAUDE_SKILL_DIR');expect(text).toContain('C2C_PROJECT_ROOT');expect(text).toContain('C2C_RESOURCE_ROOT');
});
