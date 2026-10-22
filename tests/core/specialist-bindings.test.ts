import {expect,it} from 'vitest';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {findExecutable} from '../../src/core/codex';
import {generateSpecialistBindings} from '../../src/core/specialist-bindings';
import type {BundleFile,Finding,SourceSnapshot} from '../../src/shared/contracts';

const hash=(data:string|Buffer)=>createHash('sha256').update(data).digest('hex');
function fixture(headers='tools: Read, Glob, Grep, Write, Edit\ndisallowedTools: Bash\nmodel: opus\nmaxTurns: 20',body='Translated purpose. Preserve user approval before any write.',name='reviewer'){
  const sourcePath='.claude/agents/'+name+'.md',target='source-context/'+sourcePath;
  const raw='---\nname: '+name+'\ndescription: Specialist for a precise purpose\n'+headers+'\n---\nOriginal body must not replace the translated body.';
  const snapshot:SourceSnapshot={id:'s',request:{url:'https://example.test/source'},commit:'pinned',files:[{path:sourcePath,data:Buffer.from(raw),mode:'100644',oid:'oid'}],warnings:[]};
  const files=new Map<string,BundleFile>();
  const add=(path:string,data:string|Buffer,sourcePath?:string)=>{const buffer=Buffer.from(data);files.set(path,{path,data:buffer,sha256:hash(buffer),sourcePath});};
  add(target,body,sourcePath);const findings:Finding[]=[];
  return{snapshot,files,findings,add,target,sourcePath,run:(skillCalls:Record<string,string>={},pluginName='example')=>generateSpecialistBindings({snapshot,files,findings,put:add,pluginName,skillCalls})};
}
async function parseToml(text:string){const python=await findExecutable('python');if(!python)throw Error('Python tomllib is required for generated TOML validation');const result=spawnSync(python,['-c','import sys,tomllib,json; print(json.dumps(tomllib.loads(sys.stdin.read())))'],{input:text,encoding:'utf8',windowsHide:true,env:{...process.env,PYTHONIOENCODING:'utf-8'}});expect(result.status,result.stderr).toBe(0);return JSON.parse(result.stdout);}

it('emits native parseable roles from translated body, preserving source controls and provenance',async()=>{
  const f=fixture(undefined,'Unicode ação, literal \\path and "quotes".\n[features]\nshell_tool = true\nApproval required.');const manifest=f.run();
  expect(manifest.roles).toHaveLength(1);const role=manifest.roles[0];expect(role.status).toBe('conditional');
  const native=await parseToml(f.files.get(role.resourcePath!)!.data.toString());
  expect(native.name).toBe(role.targetName);expect(native.features.shell_tool).toBe(false);
  expect(native.developer_instructions).toContain(f.files.get(f.target)!.data.toString());
  expect(native.developer_instructions).not.toContain('Original body must not replace');
  expect(native.model).toBeUndefined();expect(native.maxTurns).toBeUndefined();
  expect(role.sourceMetadata.model).toBe('opus');expect(role.sourceMetadata.maxTurns).toBe(20);
  expect(role.body.sha256).toBe(hash(f.files.get(f.target)!.data));expect(native.developer_instructions).toContain('STOP');
  expect(f.findings.some(x=>x.severity==='blocking')).toBe(false);
});
it('binds every preload to a selected native call and resource, retaining manual invocation',()=>{
  const f=fixture('tools: Read, Glob, Grep, Write, Edit, Bash\nskills: [audit]');
  f.add('skills/actual/SKILL.md','---\nname: actual\ndescription: Active audit\n---\nAudit.', '.claude/skills/audit/SKILL.md');
  f.add('skills/actual/agents/openai.yaml','policy:\n  allow_implicit_invocation: false\n');
  const role=f.run({audit:'actual'}).roles[0];expect(role.preloads).toEqual([expect.objectContaining({sourceName:'audit',nativeCall:'$actual',resourcePath:'skills/actual/SKILL.md',manualOnly:true})]);
  expect(f.files.get(role.resourcePath!)!.data.toString()).toContain('explicit user invocation');expect(f.findings.some(x=>x.severity==='blocking')).toBe(false);
});
it('blocks missing or falsely advertised preloads before emitting a usable role',()=>{
  for(const mismatch of [false,true]){const f=fixture('tools: Read, Glob, Grep, Write, Edit, Bash\nskills: [audit]');if(mismatch)f.add('skills/other/SKILL.md','---\nname: other\n---\nOther');const role=f.run({audit:'absent'}).roles[0];expect(role.status).toBe('blocked');expect(role.resourcePath).toBeUndefined();expect(f.findings.some(x=>x.code==='specialist-binding-missing-preload'&&x.file===f.target&&x.severity==='blocking')).toBe(true);}
});
it('blocks unknown hard controls and unsupported write bans rather than weakening them',()=>{
  for(const headers of ['tools: Read, Write, Edit\ndisallowedTools: [Write]','tools: Read, Write, Edit\npermissionMode: bypassPermissions','tools: Read, Write, Edit\nisolation: magic','tools: Read, Write, Edit\nmemory: user','tools: Read, Grep']){const f=fixture(headers),role=f.run().roles[0];expect(role.status,headers).toBe('blocked');expect(role.resourcePath).toBeUndefined();expect(f.findings.some(x=>x.severity==='blocking')).toBe(true);}
});
it('keeps recognized tool allowlists conditional on actual masks including inherited MCP',()=>{
  const f=fixture('tools: Read, Glob, Grep, Write, Edit, Bash, WebSearch');const role=f.run().roles[0];const text=f.files.get(role.resourcePath!)!.data.toString();
  expect(role.runtimeRequirements.join('\n')).toMatch(/actual.*tool.*mask/i);expect(text).toContain('MCP');expect(text).toContain('parent');expect(text).toContain('STOP');expect(text).toContain('controlled I/O relay');
});
it('turns project memory into private explicit checkpoints and retains verified worktree requirements',async()=>{
  const f=fixture('tools: Read, Glob, Grep, Write, Edit, Bash\nmemory: project\nisolation: worktree');const role=f.run().roles[0],native=await parseToml(f.files.get(role.resourcePath!)!.data.toString());
  expect(native.features.memories).toBe(false);expect(native.sandbox_mode).toBeUndefined();expect(native.approval_policy).toBeUndefined();
  expect(native.developer_instructions).toContain('git -C');expect(native.developer_instructions).toContain('worktree list --porcelain');expect(native.developer_instructions).toContain('worktree add --detach');
  expect(native.developer_instructions).toContain('checkpoint');expect(native.developer_instructions).toContain('private');expect(native.developer_instructions).toContain('policy forbids');
});
it('uses stable namespaced role names without builtin collisions or order dependence',()=>{
  const a=fixture(undefined,undefined,'default'),b=fixture(undefined,undefined,'default');const x=a.run({},'plugin/a').roles[0],y=b.run({},'plugin-b').roles[0];expect(x.targetName).toMatch(/^[a-z0-9][a-z0-9-]+$/);expect(x.targetName).not.toBe('default');expect(x.targetName).not.toBe(y.targetName);expect(a.run({},'plugin/a').roles[0].targetName).toBe(x.targetName);
});
it('regenerates only its owned resources after semantic body updates without duplicating findings',()=>{
  const f=fixture();const first=f.run(),name=first.roles[0].targetName,count=f.findings.length;f.add(f.target,'Final translated body with consent.',f.sourcePath);const second=f.run();expect(second.roles[0].targetName).toBe(name);expect(f.files.get(second.roles[0].resourcePath!)!.data.toString()).toContain('Final translated body with consent.');expect(f.findings).toHaveLength(count);expect(JSON.parse(f.files.get('codex-compat/specialist-bindings.json')!.data.toString()).roles[0].body.sha256).toBe(hash('Final translated body with consent.'));
});
it('never overwrites a colliding source or externally modified generated resource',()=>{
  for(const sourceCollision of [true,false]){const f=fixture();const first=f.run(),path=first.roles[0].resourcePath!;f.add(path,'existing data',sourceCollision?'upstream/agent.toml':undefined);f.run();expect(f.files.get(path)!.data.toString()).toBe('existing data');expect(f.findings.some(x=>x.code==='specialist-binding-resource-collision'&&x.severity==='blocking')).toBe(true);}
});
it('resolves Agent(...) target allowlists and blocks missing child roles',()=>{
  const f=fixture('tools: Read, Glob, Grep, Write, Edit, Bash, Agent(child-one, child-two)');const role=f.run().roles[0];expect(role.status).toBe('blocked');expect(f.findings.some(x=>x.code==='specialist-binding-missing-role')).toBe(true);
});
it('emits inert project guidance without performing registration',()=>{
  const f=fixture();const manifest=f.run();const guide=f.files.get('codex-compat/specialists.md')!.data.toString();expect(guide).toContain('.codex/agents/');expect(guide).toContain(manifest.roles[0].targetName);expect(guide).toContain(manifest.roles[0].body.path);expect(guide).toContain('actual discovery');expect(guide).toContain('approval');expect(guide).toMatch(/copy/i);expect([...f.files.keys()].some(p=>p.startsWith('.codex/agents/'))).toBe(false);
});
it('registers approved roles through literal v1 CLI arguments instead of assuming directory discovery',async()=>{
  const f=fixture(),manifest=f.run(),role=manifest.roles[0],guide=f.files.get('codex-compat/specialists.md')!.data.toString();
  const recipe=guide.match(/```javascript\n([\s\S]*?)\n```/)?.[1];expect(recipe).toBeDefined();
  const root=await mkdtemp(join(tmpdir(),'c2c registration ação $ '));
  try{
    const packageDir=join(root,'package with spaces'),project=join(root,'approved project'),task=join(root,'task.txt');await mkdir(packageDir);await mkdir(project);
    for(const [path,file] of f.files){const destination=join(packageDir,path);await mkdir(join(destination,'..'),{recursive:true});await writeFile(destination,file.data);}
    await writeFile(task,'Review literal $(never-run) and `text`.');const script=join(root,'register.mjs');await writeFile(script,recipe!);
    const {registerSpecialists}=await import(pathToFileURL(script).href);let call:any;
    const result=registerSpecialists('installed codex.exe',packageDir,project,'read-only','never',task,[role.targetName],(file:string,args:string[],options:unknown)=>{call={file,args,options};return{status:0};});
    expect(result.status).toBe(0);expect(call.file).toBe('installed codex.exe');
    expect(call.args).toEqual(expect.arrayContaining(['features.multi_agent=true','features.multi_agent_v2=false','agents.enabled=true',`agents.${role.targetName}.config_file=${JSON.stringify(join(packageDir,role.resourcePath!))}`]));
    expect(call.args.at(-1)).toContain('Review literal $(never-run) and `text`.');expect(call.options).toMatchObject({shell:false,cwd:project});
    expect(await readFile(join(packageDir,role.resourcePath!),'utf8')).toContain('shell_tool = false');
    expect(guide).toContain('agent_type');expect(guide).toContain('multi_agent_v2');expect(guide).toMatch(/CLI child[\s\S]*STOP/);
  }finally{await rm(root,{recursive:true,force:true});}
});
it('refuses blocked or changed role resources before launching the registration recipe',async()=>{
  const f=fixture(),manifest=f.run(),role=manifest.roles[0],guide=f.files.get('codex-compat/specialists.md')!.data.toString();
  const recipe=guide.match(/```javascript\n([\s\S]*?)\n```/)?.[1];expect(recipe).toBeDefined();const root=await mkdtemp(join(tmpdir(),'c2c-registration-'));
  try{
    const script=join(root,'register.mjs');await writeFile(script,recipe!);const {registerSpecialists}=await import(pathToFileURL(script).href);
    const packageDir=join(root,'package'),project=join(root,'project');await mkdir(project);
    for(const [path,file] of f.files){const destination=join(packageDir,path);await mkdir(join(destination,'..'),{recursive:true});await writeFile(destination,file.data);}
    const task=join(root,'task.txt');await writeFile(task,'Approved task.');let launched=false;const launch=()=>{launched=true;return{status:0};};
    await writeFile(join(packageDir,role.resourcePath!),'modified role');expect(()=>registerSpecialists('codex.exe',packageDir,project,'read-only','never',task,[role.targetName],launch)).toThrow(/hash/i);
    manifest.roles[0].status='blocked';await writeFile(join(packageDir,'codex-compat/specialist-bindings.json'),JSON.stringify(manifest));
    expect(()=>registerSpecialists('codex.exe',packageDir,project,'read-only','never',task,[role.targetName],launch)).toThrow(/conditional/i);expect(launched).toBe(false);
  }finally{await rm(root,{recursive:true,force:true});}
});
it('rejects a task project inside the installed package before launching the recipe',async()=>{
  const f=fixture(),role=f.run().roles[0],guide=f.files.get('codex-compat/specialists.md')!.data.toString();
  const recipe=guide.match(/```javascript\n([\s\S]*?)\n```/)?.[1];expect(recipe).toBeDefined();const root=await mkdtemp(join(tmpdir(),'c2c-separation-'));
  try{
    const script=join(root,'register.mjs');await writeFile(script,recipe!);const {registerSpecialists}=await import(pathToFileURL(script).href);
    for(const [path,file] of f.files){const destination=join(root,path);await mkdir(join(destination,'..'),{recursive:true});await writeFile(destination,file.data);}
    const nested=join(root,'nested project');await mkdir(nested);const task=join(root,'task.txt');await writeFile(task,'Approved task.');let launched=false;
    for(const project of [root,nested])expect(()=>registerSpecialists('codex.exe',root,project,'workspace-write','never',task,[role.targetName],()=>{launched=true;return{status:0};})).toThrow(/separate.*project/i);
    expect(launched).toBe(false);
  }finally{await rm(root,{recursive:true,force:true});}
});
it('binds valid child identities and revokes a previously emitted role when a child becomes blocked',()=>{
  const f=fixture('tools: Read, Glob, Grep, Write, Edit, Bash, Agent(child)');
  const source='.claude/agents/child.md',data='---\nname: child\ndescription: Child specialist\ntools: Read, Glob, Grep, Write, Edit\ndisallowedTools: Bash\n---\nOriginal child';
  f.snapshot.files.push({path:source,data:Buffer.from(data),mode:'100644',oid:'child'});f.add('source-context/'+source,'Translated child.',source);
  const first=f.run(),parent=first.roles.find(role=>role.sourceName==='reviewer')!,child=first.roles.find(role=>role.sourceName==='child')!;
  expect(parent.delegatedRoles).toEqual([{sourceName:'child',targetName:child.targetName}]);expect(parent.status).toBe('conditional');
  f.snapshot.files.find(file=>file.path===source)!.data=Buffer.from(data.replace('disallowedTools: Bash','disallowedTools: Write'));
  const second=f.run();expect(second.roles.every(role=>role.status==='blocked')).toBe(true);expect(f.findings.some(item=>item.code==='specialist-binding-blocked-child')).toBe(true);
  expect(f.files.get(parent.resourcePath!)!.data.toString()).not.toMatch(/^name\s*=/m);
});
it('rejects a missing explicitly mapped role body and empty translated body',()=>{
  const f=fixture();const manifest=generateSpecialistBindings({snapshot:f.snapshot,files:f.files,findings:f.findings,put:f.add,pluginName:'example',sourceToTarget:{[f.sourcePath]:'missing/translated-role.md'}});
  expect(manifest.roles[0].status).toBe('blocked');expect(f.findings.some(item=>item.code==='specialist-binding-missing-body')).toBe(true);
  const blank=fixture(undefined,'   \n');expect(blank.run().roles[0].status).toBe('blocked');
});
it('does not silently choose a source preload alias shared by multiple selected skills',()=>{
  const f=fixture('tools: Read, Glob, Grep, Write, Edit, Bash\nskills: [same]');
  for(const name of ['one','two']){const path=`plugins/${name}/skills/same/SKILL.md`;f.snapshot.files.push({path,data:Buffer.from('---\nname: same\n---\nOriginal'),mode:'100644',oid:name});f.add(`skills/${name}/SKILL.md`,`---\nname: ${name}\n---\nSelected`,path);}
  expect(f.run().roles[0].status).toBe('blocked');
  expect(f.run({same:'one'}).roles[0].preloads[0].nativeCall).toBe('$one');
});
it('treats inherited JavaScript property names as missing untrusted preload names',()=>{
  for(const name of ['constructor','toString','__proto__']){const f=fixture('tools: Read, Glob, Grep, Write, Edit, Bash\nskills: ['+name+']');expect(()=>f.run()).not.toThrow();expect(f.run().roles[0].status).toBe('blocked');expect(f.findings.some(item=>item.code==='specialist-binding-missing-preload')).toBe(true);}
});
