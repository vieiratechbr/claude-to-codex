import {afterEach,expect,it} from 'vitest';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,delimiter} from 'node:path';
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import type {BundleFile,Finding} from '../../src/shared/contracts';
import {adaptProjectScripts} from '../../src/core/script-portability';

function verifiedTestBash():string {
  const override=process.env.C2C_TEST_BASH;
  const gitRoots=process.platform==='win32'?[process.env.ProgramW6432,process.env.ProgramFiles,process.env['ProgramFiles(x86)']].filter((p):p is string=>!!p).map(p=>join(p,'Git')):[];
  if(process.platform==='win32'&&process.env.LOCALAPPDATA)gitRoots.push(join(process.env.LOCALAPPDATA,'Programs/Git'));
  const bundled=process.env.USERPROFILE?join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/usr/bin/sh.exe'):undefined;
  const candidates=override?[override]:process.platform==='win32'
    ?[...new Set(gitRoots.flatMap(root=>[join(root,'usr/bin/bash.exe'),join(root,'bin/bash.exe')])),...(bundled?[bundled]:[])]:['bash'];
  const failures:string[]=[];
  for(const candidate of candidates){
    const probe=spawnSync(candidate,['--version'],{encoding:'utf8',timeout:5000,windowsHide:true});
    if(probe.status===0&&/GNU bash\b/.test(probe.stdout||''))return candidate;
    failures.push(candidate+': '+(probe.error?.message||'not GNU Bash (exit '+probe.status+')'));
  }
  throw new Error((override?'C2C_TEST_BASH must name an available GNU Bash executable. ':'GNU Bash is required; install Git for Windows or set C2C_TEST_BASH. ')+failures.join('; '));
}
const bash=verifiedTestBash();
const cleanup:string[]=[];
afterEach(async()=>{await Promise.all(cleanup.splice(0).map(p=>rm(p,{recursive:true,force:true})));});
function bundle(entries:Record<string,string>){
  const files=new Map<string,BundleFile>(Object.entries(entries).map(([sourcePath,text])=>{
    const path='source-context/'+sourcePath;return [path,{path,sourcePath,data:Buffer.from(text),sha256:''}];
  }));
  const findings:Finding[]=[];
  const report=adaptProjectScripts(files,(path,data,sourcePath)=>files.set(path,{path,data:Buffer.from(data),sourcePath,sha256:''}),findings);
  return {files,report,findings};
}
async function fixture(entries:Record<string,string>){
  const root=await mkdtemp(join(tmpdir(),'c2c-portability-'));cleanup.push(root);
  const install=join(root,'installed package'),project=join(root,'projeto ação $dados (1)'),other=join(root,'other');
  await Promise.all([install,project,other].map(p=>mkdir(p,{recursive:true})));
  const result=bundle(entries);
  for(const file of result.files.values()){const dest=join(install,file.path);await mkdir(dirname(dest),{recursive:true});await writeFile(dest,file.data);}
  const run=(source:string,args:string[]=[],rootEnv:string|undefined=project,cwd=other,runtimeEnv:NodeJS.ProcessEnv={})=>{
    const result=spawnSync(bash,[join(install,'source-context',source),...args],{
      cwd,encoding:'utf8',env:{...process.env,C2C_PROJECT_ROOT:rootEnv,PATH:dirname(bash)+delimiter+process.env.PATH,...runtimeEnv},timeout:5000,input:'',windowsHide:true});
    if(result.error)throw new Error('Could not run converted script '+source+' with verified GNU Bash '+bash+': '+result.error.message,{cause:result.error});
    return result;
  };
  return {root,install,project,other,...result,run};
}

it('runs a project writer against the selected project and keeps sibling imports installed',async()=>{
  const f=await fixture({'.claude/scripts/check.sh':'#!/bin/bash\ncd "$(dirname "$0")/../.." || exit 1\nsource "$(dirname "${BASH_SOURCE[0]}")/library.sh"\nprintf "%s:%s" "$LABEL" "$(cat project.yaml)" > result.txt\ncat result.txt\n',
    '.claude/scripts/library.sh':'LABEL=installed-library\n'});
  await writeFile(join(f.project,'project.yaml'),'selected-project');
  await writeFile(join(f.install,'source-context','project.yaml'),'wrong-package');
  const out=f.run('.claude/scripts/check.sh');
  expect(out.status,out.stderr).toBe(0);
  expect(out.stdout).toBe('installed-library:selected-project');
  expect(await readFile(join(f.project,'result.txt'),'utf8')).toBe('installed-library:selected-project');
  expect(existsSync(join(f.install,'source-context','result.txt'))).toBe(false);
});

it('refuses missing, invalid and package project roots before writing',async()=>{
  const f=await fixture({'.claude/scripts/write.sh':'#!/bin/bash\ncd "$(dirname "$0")/../.."\necho bad > marker\n'});
  for(const value of ['',join(f.root,'absent'),join(f.install,'source-context')]){
    const out=f.run('.claude/scripts/write.sh',[],value);
    expect(out.status).not.toBe(0);expect(out.stderr).toContain('C2C_PROJECT_ROOT');
  }
  expect(existsSync(join(f.install,'source-context','marker'))).toBe(false);
  expect(existsSync(join(f.other,'marker'))).toBe(false);
});

it('sources mapped shared libraries and reads current project config instead of shadow config',async()=>{
  const f=await fixture({'.claude/scripts/check.sh':'#!/bin/bash\nROOT="$(cd "$(dirname "$0")/../.." && pwd)"\ncd "$ROOT" || exit 1\nif [ -f .claude/hooks/library.sh ]; then . .claude/hooks/library.sh; fi\nread_config\n',
    '.claude/hooks/library.sh':'#!/bin/bash\nread_config(){ cat project.yaml; }\n'});
  await writeFile(join(f.project,'project.yaml'),'real');
  await writeFile(join(f.install,'source-context','project.yaml'),'shadow');
  const out=f.run('.claude/scripts/check.sh');expect(out.status,out.stderr).toBe(0);expect(out.stdout).toBe('real');
});

it('keeps source-relative resource root anchors and explicit root arguments',async()=>{
  const f=await fixture({'.claude/scripts/check.sh':'#!/bin/bash\nLIB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"\nsource "$LIB_ROOT/library.sh"\nif [ -n "${1:-}" ]; then ROOT="$1"; else cd "$(dirname "$0")/../.."; ROOT="$PWD"; fi\nprintf "%s:%s" "$LABEL" "$(cat "$ROOT/project.yaml")"\n',
    '.claude/library.sh':'LABEL=resource\n'});
  await writeFile(join(f.project,'project.yaml'),'selected');await writeFile(join(f.other,'project.yaml'),'explicit');
  const out=f.run('.claude/scripts/check.sh',[f.other]);expect(out.status,out.stderr).toBe(0);expect(out.stdout).toBe('resource:explicit');
});

it('separates a shared directory anchor into project fallback and installed helper reads',async()=>{
  const f=await fixture({'.claude/scripts/check.sh':`#!/bin/bash
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT_ARG="\${1:-}"
if [ -n "$ROOT_ARG" ]; then cd "$ROOT_ARG"; else cd "$HERE/../.."; fi
[ -f "$HERE/value.awk" ] || { echo "check: $HERE/value.awk is missing" >&2; exit 1; }
VALUE=$(awk -f "$HERE/value.awk" project.yaml)
LABEL=$(bash "$HERE/label.sh" --root .)
DOC="$HERE/../docs/note.md"
NOTE=$(awk '
  { print $0 }
  ' "$DOC")
printf '%s:%s:%s' "$LABEL" "$VALUE" "$NOTE"
`,'.claude/scripts/value.awk':'{ print $0 }\n',
    '.claude/scripts/label.sh':'#!/bin/bash\nprintf installed-helper\n',
    '.claude/docs/note.md':'installed-note'});
  expect(f.report.unresolvedPaths).toEqual([]);
  await writeFile(join(f.project,'project.yaml'),'selected');await writeFile(join(f.other,'project.yaml'),'explicit');
  await writeFile(join(f.install,'source-context','project.yaml'),'shadow');
  // A controlled runtime prerequisite: the bundled GNU Bash may be sh.exe.
  const bin=join(f.root,'bin');await mkdir(bin);const launcher=join(bin,'bash');
  await writeFile(launcher,'#!/bin/sh\nexec "$C2C_TEST_BASH" --noprofile --norc "$@"\n');await chmod(launcher,0o755);
  const runtimeEnv={C2C_TEST_BASH:bash.replace(/\\/g,'/'),PATH:bin+delimiter+dirname(bash)+delimiter+process.env.PATH};
  const selected=f.run('.claude/scripts/check.sh',[],f.project,f.other,runtimeEnv);expect(selected.status,selected.stderr).toBe(0);expect(selected.stdout).toBe('installed-helper:selected:installed-note');
  const explicit=f.run('.claude/scripts/check.sh',[f.other],f.project,f.other,runtimeEnv);expect(explicit.status,explicit.stderr).toBe(0);expect(explicit.stdout).toBe('installed-helper:explicit:installed-note');
  expect(await readFile(join(f.install,'source-context','project.yaml'),'utf8')).toBe('shadow');
});

it('does not approve unknown or mutating uses of a shared resource directory',()=>{
  for(const use of [
    'cd "$HERE"\n',
    'rm "$HERE/value.awk"\n',
    'unknown_tool "$HERE/value.awk"\n',
    'awk -f "$HERE/value.awk" project.yaml > "$HERE/value.awk"\n',
    'DOC="$HERE/../docs/note.md"\nrm "$DOC"\n',
    'bash "$HERE/missing.sh"\n',
  ]){
    const source='#!/bin/bash\nHERE="$(cd "$(dirname "$0")" && pwd)"\ncd "$HERE/../.."\n'+use;
    const f=bundle({'.claude/scripts/check.sh':source,'.claude/scripts/value.awk':'{ print $0 }\n','.claude/docs/note.md':'note'});
    expect(f.report.unresolvedPaths,use).toEqual(['source-context/.claude/scripts/check.sh']);
    expect(f.files.get('source-context/.claude/scripts/check.sh')!.data.toString()).toBe(source);
  }
});

it('keeps a source --root selector bound to the authoritative project before nested calls or writes',async()=>{
  const selector=`ROOT_ARG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --root) [ $# -ge 2 ] || exit 2; ROOT_ARG="$2"; shift 2 ;;
    --root=*) ROOT_ARG="\${1#--root=}"; shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done
if [ -n "$ROOT_ARG" ]; then
  cd "$ROOT_ARG" 2>/dev/null || { echo "cannot read root" >&2; exit 1; }
else
  cd "$HERE/../.." || exit 1
fi
`;
  const f=await fixture({'.claude/scripts/parent.sh':'#!/bin/bash\nHERE="$(cd "$(dirname "$0")" && pwd)"\n'+selector+
    'printf "%s:" "$(cat project.yaml)"\nbash "$HERE/child.sh" --root .\nprintf marker > result.txt\n',
    '.claude/scripts/child.sh':'#!/bin/bash\nHERE="$(cd "$(dirname "$0")" && pwd)"\n'+selector+'cat project.yaml\n'});
  expect(f.report.unresolvedPaths).toEqual([]);
  await writeFile(join(f.project,'project.yaml'),'selected');await writeFile(join(f.other,'project.yaml'),'other');
  await writeFile(join(f.install,'source-context/project.yaml'),'installed');
  const bin=join(f.root,'bin');await mkdir(bin);const launcher=join(bin,'bash');
  await writeFile(launcher,'#!/bin/sh\nexec "$C2C_TEST_BASH" --noprofile --norc "$@"\n');await chmod(launcher,0o755);
  const runtimeEnv={C2C_TEST_BASH:bash.replace(/\\/g,'/'),PATH:bin+delimiter+dirname(bash)+delimiter+process.env.PATH};
  for(const conflicting of [f.other,f.install,join(f.install,'source-context')]){
    for(const args of [['--root',conflicting],['--root='+conflicting]]){
      const out=f.run('.claude/scripts/parent.sh',args,f.project,f.other,runtimeEnv);
      expect(out.status,conflicting+' '+out.stderr).not.toBe(0);expect(out.stderr).toContain('--project');expect(out.stdout).toBe('');
      for(const root of [f.project,f.other,f.install,join(f.install,'source-context')])expect(existsSync(join(root,'result.txt'))).toBe(false);
    }
  }
  const alias=join(f.root,'project alias');await symlink(f.project,alias,process.platform==='win32'?'junction':'dir');
  for(const args of [[],['--root','.'],['--root',f.project],['--root='+f.project],['--root',alias]]){
    const out=f.run('.claude/scripts/parent.sh',args,f.project,f.other,runtimeEnv);
    expect(out.status,out.stderr).toBe(0);expect(out.stdout).toBe('selected:selected');
    expect(await readFile(join(f.project,'result.txt'),'utf8')).toBe('marker');
  }
  const unknown=f.run('.claude/scripts/parent.sh',['--unknown'],f.project,f.other,runtimeEnv);
  expect(unknown.status).toBe(2);expect(unknown.stderr).toContain('unknown option: --unknown');
  expect(await readFile(join(f.other,'project.yaml'),'utf8')).toBe('other');
  expect(await readFile(join(f.install,'source-context/project.yaml'),'utf8')).toBe('installed');
  const adapted=f.files.get('source-context/.claude/scripts/parent.sh')!.data.toString();
  adaptProjectScripts(f.files,(path,data,sourcePath)=>f.files.set(path,{path,data:Buffer.from(data),sourcePath,sha256:''}),[]);
  expect(f.files.get('source-context/.claude/scripts/parent.sh')!.data.toString()).toBe(adapted);
});

it('keeps unrecognized computed ancestor selectors blocked and unchanged',()=>{
  const source='#!/bin/bash\nROOT="$(cd "$(dirname "$0")/$LEVEL" && pwd)"\ncd "$ROOT"\ncat project.yaml\n';
  const f=bundle({'.claude/scripts/unknown.sh':source});
  expect(f.report.unresolvedPaths).toEqual(['source-context/.claude/scripts/unknown.sh']);
  expect(f.findings.some(x=>x.severity==='blocking')).toBe(true);
  expect(f.files.get('source-context/.claude/scripts/unknown.sh')!.data.toString()).toBe(source);
});

it('does not let a source marker or compound source line bypass unsafe-anchor review',()=>{
  for(const source of [
    '#!/bin/bash\n# C2C project-script portability v1\nROOT="$(cd "$(dirname "$0")/$LEVEL" && pwd)"\ncd "$ROOT"\n',
    '#!/bin/bash\nLIB_ROOT="$(cd "$(dirname "$0")/$LEVEL" && pwd)"\nsource "$LIB_ROOT/library.sh"; cd "$LIB_ROOT"\n',
    '#!/bin/bash\nROOT="$(cd "$(dirname "$0")/../.." && pwd)"; OTHER="$(cd "$(dirname "$0")/$LEVEL" && pwd)"\ncd "$OTHER"\n',
    '#!/bin/bash\nsource "$(dirname "$0")/library.sh"; cd "$(dirname "$0")/$LEVEL"\n',
    '#!/bin/bash\nROOT="${BASH_SOURCE[0]%/*}/../.."\ncd "$ROOT"\n',
    '#!/bin/bash\nROOT="$(realpath "$0")"\ncd "$(dirname "$ROOT")/../.."\n',
  ]){
    const f=bundle({'.claude/scripts/check.sh':source});
    expect(f.report.unresolvedPaths).toHaveLength(1);
  }
});

it('uses explicit project selection even when status payload names a different directory',async()=>{
  const f=await fixture({'.claude/statusline.sh':'#!/bin/bash\ncwd="${PAYLOAD_CWD:-}"\n[ -z "$cwd" ] && cwd="."\ncat "$cwd/project.yaml"\n'});
  await writeFile(join(f.project,'project.yaml'),'selected');await writeFile(join(f.other,'project.yaml'),'payload');
  const out=spawnSync(bash,[join(f.install,'source-context/.claude/statusline.sh')],{cwd:f.other,encoding:'utf8',env:{...process.env,C2C_PROJECT_ROOT:f.project,PAYLOAD_CWD:f.other,PATH:dirname(bash)+delimiter+process.env.PATH},timeout:5000});
  expect(out.status,out.stderr).toBe(0);expect(out.stdout).toBe('selected');
});

it('keeps an immutable mapped catalog separate from explicit artifact root',async()=>{
  const f=await fixture({'.claude/scripts/catalog.sh':'#!/bin/bash\nROOT_ARG="${1:-}"\nif [ -n "$ROOT_ARG" ]; then ROOT="$ROOT_ARG"; else cd "$(dirname "$0")/../.."; ROOT="$PWD"; fi\nCATALOG="$ROOT/.claude/docs/workflow-catalog.yaml"\nprintf "%s:%s" "$(cat "$CATALOG")" "$(cat "$ROOT/project.yaml")"\n',
    '.claude/docs/workflow-catalog.yaml':'installed-catalog'});
  await writeFile(join(f.other,'project.yaml'),'explicit-project');
  const out=f.run('.claude/scripts/catalog.sh',[f.other]);expect(out.status,out.stderr).toBe(0);expect(out.stdout).toBe('installed-catalog:explicit-project');
});

it('treats mapped resource names as literal shell data',async()=>{
  const f=await fixture({'.claude/scripts/check.sh':'#!/bin/bash\nif [ -f .claude/hooks/library.sh ]; then source .claude/hooks/library.sh; fi\nprintf "%s" "$LABEL"\n',
    '.claude/hooks/library.sh':'LABEL=literal-library\n'});
  const library=f.files.get('source-context/.claude/hooks/library.sh')!;
  f.files.delete(library.path);
  library.path='source-context/.claude/hooks/lib $money (1).sh';f.files.set(library.path,library);
  // Re-adapt the caller from original bytes with a nontrivial mapped location.
  const caller=f.files.get('source-context/.claude/scripts/check.sh')!;
  caller.data=Buffer.from('#!/bin/bash\nif [ -f .claude/hooks/library.sh ]; then source .claude/hooks/library.sh; fi\nprintf "%s" "$LABEL"\n');
  adaptProjectScripts(f.files,(path,data,sourcePath)=>f.files.set(path,{path,data:Buffer.from(data),sourcePath,sha256:''}),[]);
  for(const file of f.files.values()){const dest=join(f.install,file.path);await mkdir(dirname(dest),{recursive:true});await writeFile(dest,file.data);}
  const out=f.run('.claude/scripts/check.sh');expect(out.status,out.stderr).toBe(0);expect(out.stdout).toBe('literal-library');
});

it.runIf(process.platform==='win32')('rejects differently cased and junction aliases of installed resources',async()=>{
  const f=await fixture({'.claude/scripts/check.sh':'#!/bin/bash\ncd "$(dirname "$0")/../.."\nprintf allowed\n'});
  const alias=join(f.root,'package junction');await symlink(join(f.install,'source-context'),alias,'junction');
  for(const selected of [f.install.toUpperCase(),join(f.install,'source-context').toUpperCase(),alias]){
    const out=f.run('.claude/scripts/check.sh',[],selected);
    expect(out.status,selected+' '+out.stderr).not.toBe(0);expect(out.stdout).toBe('');
  }
});

it('does not mistake a native timeout utility for POSIX timeout and lose event stdin',async()=>{
  const f=await fixture({'.claude/scripts/read.sh':'#!/bin/bash\nif command -v timeout >/dev/null 2>&1; then\n INPUT=$(timeout 2 cat 2>/dev/null)\nelse\n INPUT=$(cat)\nfi\nprintf "%s" "$INPUT"\n'});
  const bin=join(f.other,'bin');await mkdir(bin);
  const timeout=join(bin,'timeout');await writeFile(timeout,'#!/usr/bin/sh\n[ "$1" = --version ] && exit 1\nprintf native-not-payload\n');await chmod(timeout,0o755);
  const out=spawnSync(bash,[join(f.install,'source-context/.claude/scripts/read.sh')],{cwd:f.other,encoding:'utf8',input:'event-payload',timeout:5000,env:{...process.env,C2C_PROJECT_ROOT:f.project,PATH:bin+delimiter+dirname(bash)+delimiter+process.env.PATH}});
  expect(out.status,out.stderr).toBe(0);expect(out.stdout).toBe('event-payload');
});

it('does not rewrite a project path that merely ends with a mapped resource name',async()=>{
  const f=await fixture({'.claude/scripts/check.sh':'#!/bin/bash\nsource unrelated/.claude/hooks/library.sh\nprintf "%s" "$LABEL"\n',
    '.claude/hooks/library.sh':'LABEL=package-library\n'});
  await mkdir(join(f.project,'unrelated/.claude/hooks'),{recursive:true});await writeFile(join(f.project,'unrelated/.claude/hooks/library.sh'),'LABEL=project-library\n');
  const out=f.run('.claude/scripts/check.sh');expect(out.status,out.stderr).toBe(0);expect(out.stdout).toBe('project-library');
});

it('keeps self-reading help ranges on original documentation after adding the guard',async()=>{
  const f=await fixture({'.claude/scripts/help.sh':'#!/bin/bash\n# Useful help\n# use --dry-run\n\nif [ "${1:-}" = --help ]; then sed -n "2,3p" "$0" | sed "s/^# //"; exit 0; fi\n'});
  const out=f.run('.claude/scripts/help.sh',['--help']);expect(out.status,out.stderr).toBe(0);expect(out.stdout).toBe('Useful help\nuse --dry-run\n');
});

it.each(['observations','compatibility'] as const)('does not audit source folders as native %s when advertised Codex resources exist elsewhere',async kind=>{
  // Removing the source-format guard would inspect an empty or shadow .claude
  // tree and falsely report observations about that tree as the target audit.
  const scanner=kind==='observations'?`agent_dir = os.path.join(root, ".claude", "agents")
skill_dir = os.path.join(root, ".claude", "skills")
def frontmatter(text):
    return {}
print("AGENTS: 0  SKILLS: 0  DELEGATION: none")`:`claude = os.path.join(root, ".claude")
skill_dir = os.path.join(claude, "skills")
agent_dir = os.path.join(claude, "agents")
SKILL_PORTABLE = {"name", "description"}
SKILL_VARS = {"CLAUDE_SKILL_DIR"}
print("FILES: skills=0 agents=0  COUNT: questions=0")`;
  const source='#!/bin/bash\nROOT="$(cd "$(dirname "$0")/../.." && pwd)"\npython - "$ROOT" <<\'PYEOF\'\nimport os, sys\nroot = sys.argv[1]\n'+scanner+'\nPYEOF\nprintf false-clean > scanner-ran.txt\n';
  const f=await fixture({'.claude/scripts/inspect-targets.sh':source});
  const nativeSkill=join(f.project,'.agents/skills/native-design/SKILL.md'),nativeRole=join(f.other,'roles/native-reviewer.toml');
  await Promise.all([mkdir(dirname(nativeSkill),{recursive:true}),mkdir(dirname(nativeRole),{recursive:true})]);
  await writeFile(nativeSkill,'---\nname: native-design\ndescription: Native target\n---\nRead and compare design.\n');
  await writeFile(nativeRole,'name = "native-reviewer"\ndeveloper_instructions = "Review only"\n');
  await writeFile(join(f.project,'advertised-targets.json'),JSON.stringify({skills:[{name:'native-design',path:nativeSkill}],roles:[{name:'native-reviewer',path:nativeRole}]}));
  const beforeSkill=await readFile(nativeSkill),beforeRole=await readFile(nativeRole);
  expect(existsSync(join(f.project,'.claude'))).toBe(false);
  for(const shadow of [false,true]){
    if(shadow){await mkdir(join(f.project,'.claude/agents'),{recursive:true});await writeFile(join(f.project,'.claude/agents/shadow.md'),'wrong source-format agent');}
    const out=f.run('.claude/scripts/inspect-targets.sh');
    expect(out.status,out.stderr).toBe(2);
    expect(out.stdout).toMatch(kind==='observations'?/^Observations: not run \(/:/^Compatibility: not run \(/);
    expect(out.stdout).not.toContain('AGENTS: 0');expect(out.stdout).not.toContain('COUNT: questions=0');
    expect(out.stderr).toContain('advertised');expect(out.stderr).toContain('checked/total');expect(out.stderr).toContain('NOT ASSESSED');
    expect(existsSync(join(f.project,'scanner-ran.txt'))).toBe(false);
  }
  expect(await readFile(nativeSkill)).toEqual(beforeSkill);expect(await readFile(nativeRole)).toEqual(beforeRole);
  expect(f.findings.filter(x=>x.code==='source-inventory-target-audit-required')).toHaveLength(1);
  expect(f.findings.some(x=>x.severity==='blocking')).toBe(false);
  const adapted=f.files.get('source-context/.claude/scripts/inspect-targets.sh')!.data.toString();
  adaptProjectScripts(f.files,(path,data,sourcePath)=>f.files.set(path,{path,data:Buffer.from(data),sourcePath,sha256:''}),[]);
  expect(f.files.get('source-context/.claude/scripts/inspect-targets.sh')!.data.toString()).toBe(adapted);
});
