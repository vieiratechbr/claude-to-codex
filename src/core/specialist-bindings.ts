import {createHash} from 'node:crypto';
import type {BundleFile,Finding,SourceSnapshot} from '../shared/contracts';
import {markdownMetadata} from './inventory';
import {activeSkillDetails} from './skill-calls';

type Put=(path:string,data:string|Buffer,sourcePath?:string,replace?:boolean)=>void;
export interface SpecialistBindingsOptions {
  snapshot:Pick<SourceSnapshot,'commit'|'files'>;
  /** Already translated/preserved bodies and selected native skills. No source code is executed. */
  files:Map<string,BundleFile>;
  pluginName:string;
  skillCalls?:Record<string,string>;
  sourceToTarget?:Record<string,string>;
  put:Put;
  findings:Finding[];
}
export interface SpecialistBinding {
  sourcePath:string;
  sourceName:string;
  sourceMetadata:Record<string,unknown>;
  targetName:string;
  body:{path:string;sha256:string};
  status:'conditional'|'blocked';
  resourcePath?:string;
  featureMask:Record<string,false>;
  preloads:{sourceName:string;nativeCall:string;resourcePath:string;sha256:string;manualOnly:boolean}[];
  delegatedRoles:{sourceName:string;targetName:string}[];
  runtimeRequirements:string[];
  blockers:string[];
}
export interface SpecialistBindingManifest {
  schemaVersion:1;
  generatedBy:'claude-to-codex/specialist-bindings-v1';
  pluginName:string;
  sourceCommit:string;
  setupRequired:true;
  roles:SpecialistBinding[];
  generatedFiles:Record<string,string>;
}
const manifestPath='codex-compat/specialist-bindings.json';
const guidePath='codex-compat/specialists.md';
const generator='claude-to-codex/specialist-bindings-v1' as const;
const hash=(text:string|Buffer)=>createHash('sha256').update(text).digest('hex');
const slug=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'role';
const roleName=(namespace:string,path:string,name:string)=>`c2c-${slug(namespace).slice(0,18)}-${slug(name).slice(0,27)}-${hash(namespace+'\0'+path).slice(0,10)}`;
const metadataKeys=new Set(['name','description','tools','disallowedTools','model','maxTurns','memory','skills','isolation']);
const knownTools=new Set(['Read','Glob','Grep','Write','Edit','Bash','WebSearch','WebFetch','TodoWrite','Task','Agent']);
const nativeDocs='https://learn.chatgpt.com/docs/agent-configuration/subagents?surface=app';

function list(value:unknown):string[]|undefined {
  if(value===undefined)return [];
  if(Array.isArray(value))return value.every(item=>typeof item==='string'&&item.trim().length>0)?value.map(item=>(item as string).trim()):undefined;
  if(typeof value!=='string'||!value.trim())return undefined;
  // Agent(a,b) is one permission entry, not two tools.
  const entries=value.split(/,(?![^()]*\))/).map(item=>item.trim());
  return entries.every(Boolean)?entries:undefined;
}
function bodyText(text:string):string{return text.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/,'');}
function ownedResources(files:Map<string,BundleFile>,pluginName:string):Set<string> {
  const existing=files.get(manifestPath);if(!existing||existing.sourcePath)return new Set();
  try{
    const previous=JSON.parse(existing.data.toString()) as SpecialistBindingManifest;
    if(previous.generatedBy!==generator||previous.schemaVersion!==1||previous.pluginName!==pluginName||!previous.generatedFiles||typeof previous.generatedFiles!=='object')return new Set();
    const owned=new Set([manifestPath]);
    for(const [path,digest] of Object.entries(previous.generatedFiles)){
      const file=files.get(path);
      if((path===guidePath||/^codex-compat\/agents\/[a-z0-9-]+\.toml$/.test(path))&&file&&!file.sourcePath&&typeof digest==='string'&&hash(file.data)===digest)owned.add(path);
    }
    return owned;
  }catch{return new Set();}
}

/** Emits inert, project-installable role resources; never registers or runs a role. */
export function generateSpecialistBindings(options:SpecialistBindingsOptions):SpecialistBindingManifest {
  const {snapshot,files,put,findings,pluginName}=options;
  // Re-evaluation after semantic translation replaces only this module's diagnostic results.
  for(let index=findings.length-1;index>=0;index--)if(findings[index].code.startsWith('specialist-binding-'))findings.splice(index,1);
  const manifest:SpecialistBindingManifest={schemaVersion:1,generatedBy:generator,pluginName,sourceCommit:snapshot.commit,setupRequired:true,roles:[],generatedFiles:{}};
  const selected=activeSkillDetails([...files.values()]);
  const aliases:Record<string,string>=Object.create(null);
  const ambiguousAliases=new Set<string>();
  const addAlias=(name:string,target:string)=>{if(ambiguousAliases.has(name))return;if(aliases[name]&&aliases[name]!==target){ambiguousAliases.add(name);delete aliases[name];}else aliases[name]=target;};
  for(const skill of selected){
    addAlias(skill.name,skill.name);
    const original=snapshot.files.find(source=>source.path===files.get(skill.path)?.sourcePath);
    if(original){try{const meta=markdownMetadata(original.data.toString());if(typeof meta.name==='string')addAlias(meta.name,skill.name);}catch{/* Invalid metadata is handled by inventory. */}
      const directory=original.path.match(/(?:^|\/)skills\/([^/]+)\/SKILL\.md$/)?.[1];if(directory)addAlias(directory,skill.name);
    }
  }
  Object.assign(aliases,options.skillCalls||{});
  const children=new Map<SpecialistBinding,string[]>();
  const block=(role:SpecialistBinding,code:string,message:string)=>{
    role.status='blocked';role.blockers.push(message);delete role.resourcePath;
    findings.push({code:'specialist-binding-'+code,severity:'blocking',file:role.body.path,message});
  };
  for(const source of [...snapshot.files].sort((a,b)=>a.path.localeCompare(b.path))){
    if(!/(?:^|\/)\.claude\/agents\/[^/]+\.md$/.test(source.path))continue;
    const mapped=options.sourceToTarget?.[source.path];
    const candidates=mapped?(files.has(mapped)?[files.get(mapped)!]:[]):[...files.values()].filter(file=>file.sourcePath===source.path&&!file.path.startsWith('codex-compat/agents/'));
    if(!candidates.length&&!mapped)continue; // Unselected role resources are outside this conversion.
    let metadata:Record<string,unknown>={},parseError=false;
    try{metadata=markdownMetadata(source.data.toString().replace(/^\uFEFF/,''));}catch{parseError=true;}
    const sourceName=typeof metadata.name==='string'?metadata.name:source.path.split('/').at(-1)!.replace(/\.md$/,'');
    const targetName=roleName(pluginName,source.path,sourceName),body=candidates[0]||{path:mapped!,data:Buffer.alloc(0)};
    const role:SpecialistBinding={sourcePath:source.path,sourceName,sourceMetadata:metadata,targetName,body:{path:body.path,sha256:hash(body.data)},status:'conditional',resourcePath:`codex-compat/agents/${targetName}.toml`,featureMask:{},preloads:[],delegatedRoles:[],runtimeRequirements:[
      'Before delegation, verify actual discovery of this exact native target role and its current instructions, resource hashes, required preloads, and actual required tool mask; otherwise STOP. Parsing or copying TOML does not prove discovery or tool enforcement.',
      'The parent sandbox, approval policy, model provider, and MCP configuration are inherited. This role TOML does not override them or prove OS-level isolation. Validate inherited MCP tools against the source allowlist; otherwise STOP.',
      'Do not assume native Read/Glob/Grep or web tools exist when shell_tool is false. Use supplied raw artifacts or a controlled I/O relay limited to approved inputs/outputs only if it preserves source privacy, permissions, and independent-review boundaries; otherwise STOP. A relay must never execute commands denied to this role.',
      'Source model aliases and maxTurns are provenance/preferences only. No native model identity, cost, or hard turn-limit equivalence is asserted; arrange a real bounded review checkpoint and honor stricter parent limits.',
    ],blockers:[]};
    manifest.roles.push(role);
    if(!candidates.length)block(role,'missing-body','The explicitly mapped translated role body is missing; do not substitute another preserved file.');
    else if(candidates.length!==1)block(role,'ambiguous-body','Multiple preserved bodies exist for this source role; select its translated target explicitly.');
    if(parseError||typeof metadata.name!=='string'||!metadata.name.trim()||typeof metadata.description!=='string'||!metadata.description.trim())block(role,'invalid-metadata','Role name and description must be valid original frontmatter strings.');
    if(body.data.includes(0)||source.data.includes(0))block(role,'invalid-body','NUL-containing role text cannot be safely represented as native instructions.');
    if(!bodyText(body.data.toString()).trim())block(role,'invalid-body','The translated role body is empty; its operating purpose and constraints must be preserved.');
    for(const key of Object.keys(metadata))if(!metadataKeys.has(key))block(role,'unknown-control',`Unmapped source role metadata/control ${key}; establish its target behavior before installation.`);
    if(metadata.model!==undefined&&(typeof metadata.model!=='string'||!metadata.model.trim()))block(role,'invalid-metadata','Invalid source model preference.');
    if(metadata.maxTurns!==undefined&&(!Number.isSafeInteger(metadata.maxTurns)||Number(metadata.maxTurns)<=0))block(role,'invalid-metadata','Invalid source maxTurns preference.');
    const tools=list(metadata.tools),denied=list(metadata.disallowedTools),preloads=list(metadata.skills);
    if(!tools||!denied||!preloads)block(role,'invalid-metadata','Source tools, disallowedTools, and skills must contain nonempty string entries.');
    const childNames:string[]=[];
    for(const tool of tools||[]){
      const agent=/^Agent\(([^()]*)\)$/.exec(tool);
      if(agent){const names=agent[1].split(',').map(name=>name.trim());if(names.some(name=>!name))block(role,'unknown-control','Empty delegated Agent target in source allowlist.');else childNames.push(...names);}
      else if(!knownTools.has(tool))block(role,'unknown-control',`Unmapped allowed tool ${tool}; its scope must be translated before installation.`);
    }
    children.set(role,childNames);
    if(metadata.tools!==undefined&&tools){
      role.runtimeRequirements.push('Enforce the original explicit tool allowlist with an actual runtime mask: '+tools.join(', ')+'. Merely repeating this instruction is not tool enforcement; if the required mask cannot be verified, STOP.');
      if(!tools.includes('Bash'))role.featureMask.shell_tool=false;
      if(!tools.includes('Write')||!tools.includes('Edit'))block(role,'unsupported-denial','The source allowlist denies a file-write/edit capability. Native role feature flags do not prove that denial; actual supported enforcement is required before installation.');
    }
    for(const tool of denied||[]){
      if(tool==='Bash')role.featureMask.shell_tool=false;
      else block(role,'unsupported-denial',`Source disallowed tool ${tool} has no verified native role feature reduction; installation is blocked until actual enforcement exists.`);
    }
    if(role.featureMask.shell_tool===false)role.runtimeRequirements.push('Require a registered native role with features.shell_tool=false, verify the actual shell-disabled mask before use, and do not relay shell commands through the parent, MCP, or another worker. This is a declarative tool reduction, not a separate OS sandbox.');
    for(const name of preloads||[]){
      const target=aliases[name]?.replace(/^\$/,'');const matches=selected.filter(skill=>skill.name===target);
      if(matches.length!==1){block(role,'missing-preload',`Required source preload ${name} has no unique selected native skill call and concrete resource.`);continue;}
      const skill=matches[0];role.preloads.push({sourceName:name,nativeCall:'$'+skill.name,resourcePath:skill.path,sha256:hash(files.get(skill.path)!.data),manualOnly:skill.manualOnly});
    }
    if(metadata.memory!==undefined){
      if(metadata.memory!=='project')block(role,'unknown-control',`Unmapped source memory scope ${String(metadata.memory)}; do not broaden private memory scope.`);
      else{
        role.featureMask.memories=false;
        role.runtimeRequirements.push(`Read the private per-project checkpoint <PROJECT>/.codex/specialist-state/${targetName}.md if present before work; update it at phase boundaries only within existing write consent. Keep project facts, decisions, outstanding work and evidence scoped to this project. Confirm this directory is private and excluded from version control before storing private data; if unavailable, keep a redacted checkpoint in approved project-local storage and STOP before depending on persistent memory. Never use global/cross-project memory or claim automatic native project memory.`);
      }
    }
    if(metadata.isolation!==undefined){
      if(metadata.isolation!=='worktree')block(role,'unknown-control',`Unmapped isolation requirement ${String(metadata.isolation)}.`);
      else role.runtimeRequirements.push(worktreeRequirement());
    }
  }
  for(const role of manifest.roles){
    for(const childName of children.get(role)||[]){
      const matches=manifest.roles.filter(candidate=>candidate.sourceName===childName);
      if(matches.length!==1)block(role,'missing-role',`Source delegated role ${childName} has no unique selected native binding.`);
      else role.delegatedRoles.push({sourceName:childName,targetName:matches[0].targetName});
    }
  }
  // A parent must not expose a child whose own required controls/preloads are blocked.
  let changed=true;
  while(changed){changed=false;for(const role of manifest.roles){if(role.status==='blocked')continue;for(const child of role.delegatedRoles){if(manifest.roles.find(item=>item.targetName===child.targetName)?.status==='blocked'){block(role,'blocked-child',`Required child role ${child.sourceName} is blocked; resolve its binding first.`);changed=true;break;}}}}
  if(!manifest.roles.length)return manifest;
  const outputs=new Map<string,string>();
  for(const role of manifest.roles)if(role.resourcePath)outputs.set(role.resourcePath,nativeRole(role,files));
  outputs.set(guidePath,setupGuide(manifest));
  for(const [path,text] of outputs)manifest.generatedFiles[path]=hash(text);
  const owned=ownedResources(files,pluginName);
  // Include prior owned paths: a revoked/blocked role must not leave an active-looking stale TOML.
  const stale=[...owned].filter(path=>path!==manifestPath&&!outputs.has(path));
  for(const path of stale)outputs.set(path,`# ${generator}\n# Retired generated resource. No native agent is defined here.\n`);
  for(const [path,text] of outputs)manifest.generatedFiles[path]=hash(text);
  outputs.set(manifestPath,JSON.stringify(manifest,null,2)+'\n');
  const collisions=[...outputs.keys()].filter(path=>files.has(path)&&!owned.has(path));
  if(collisions.length){for(const path of collisions)findings.push({code:'specialist-binding-resource-collision',severity:'blocking',file:path,message:'Reserved specialist binding resource already exists or changed externally; refusing to overwrite it.'});return manifest;}
  for(const [path,text] of outputs)put(path,text,undefined,true);
  findings.push({code:'specialist-binding-setup-required',severity:'warning',file:guidePath,message:'Specialist roles require approved project setup plus actual discovery, preload, capability-mask and isolation verification before delegation. Conversion does not register agents.'});
  return manifest;
}

function nativeRole(role:SpecialistBinding,files:Map<string,BundleFile>):string {
  const preloads=role.preloads.map(item=>`- ${item.sourceName}: read/load the complete ${item.resourcePath} (SHA-256 ${item.sha256}); selected native call ${item.nativeCall}. ${item.manualOnly?'Execution requires explicit user invocation; preloading instructions does not authorize an implicit skill invocation.':'Loading instructions is a prerequisite; preserve all skill consent and invocation boundaries.'}`).join('\n')||'- No source preloads declared.';
  const delegates=role.delegatedRoles.map(item=>`${item.sourceName} -> ${item.targetName}`).join(', ');
  const instructions=`Converted specialist binding. Original role: ${role.sourcePath}; translated body: ${role.body.path}; SHA-256 ${role.body.sha256}. Resolve <PACKAGE> to the actual installed package before delegation; read <PACKAGE>/codex-compat/specialist-bindings.json and <PACKAGE>/codex-compat/specialists.md. Body and preload resource paths are relative to that package, not the project's working directory. Do not treat the preserved source frontmatter as native configuration.\n\nRuntime eligibility (mandatory before this role performs work):\n${role.runtimeRequirements.map(item=>'- '+item).join('\n')}\n\nRequired preloaded skills:\n${preloads}\n${delegates?'\nAllowed delegated role bindings: '+delegates+'. Verify the actual narrowed delegation mask and child eligibility before use; otherwise STOP.\n':''}\nTranslated role purpose and operating instructions (preserved in full):\n\n${bodyText(files.get(role.body.path)!.data.toString())}`;
  let text=`# ${generator}\n# Source: ${role.sourcePath.replace(/[\r\n]/g,' ')}\nname = ${JSON.stringify(role.targetName)}\ndescription = ${JSON.stringify(String(role.sourceMetadata.description))}\ndeveloper_instructions = ${JSON.stringify(instructions)}\n`;
  if(Object.keys(role.featureMask).length)text+='\n[features]\n'+Object.entries(role.featureMask).sort(([a],[b])=>a.localeCompare(b)).map(([key])=>`${key} = false`).join('\n')+'\n';
  return text;
}
function worktreeRequirement():string {
  return 'Worktree isolation is mandatory before the isolated phase: identify the real project, inspect applicable instructions and approvals, and STOP if policy forbids worktrees, Git is unavailable, or authorization/path/ref is unresolved. Preflight with git -C "<PROJECT>" rev-parse --show-toplevel, git -C "<PROJECT>" status --porcelain, git -C "<PROJECT>" rev-parse --verify "<APPROVED_REF>^{commit}", and git -C "<PROJECT>" worktree list --porcelain. Preview the approved destination/ref and changes; after actual approval where required, create using git -C "<PROJECT>" worktree add --detach "<APPROVED_WORKTREE>" "<APPROVED_REF>". These placeholders require concrete separately supplied arguments, never shell-evaluated source text. Verify the new absolute toplevel, HEAD matching the approved ref and its distinct entry in worktree list --porcelain, then delegate with the verified worktree as its actual working directory. Do not claim the TOML creates isolation. Do not reuse an unverified current checkout or silently downgrade isolation. Preserve uncommitted source changes with an approved snapshot strategy when required; do not reset, delete, move or commit user files merely to satisfy this preflight.';
}
function setupGuide(manifest:SpecialistBindingManifest):string {
  const cell=(value:string)=>value.replace(/\|/g,'\\|').replace(/[\r\n]/g,' ');
  return `# Converted specialist bindings\n\nGenerated by ${generator}. Native role schema: ${nativeDocs}.\n\nSetup happens at skill use, in the approved actual project; conversion only emits inert resources and never registers agents or writes personal ~/.codex/agents/configuration. Resolve <PACKAGE> to this installed package and <PROJECT> to the user's actual project. Read applicable instructions and the full translated role bodies, select conditional roles and required children, and obtain approval for the concrete runtime/project setup where required. Blocked roles cannot be installed. Copying TOML into <PROJECT>/.codex/agents/ is storage only: do not assume directory discovery or project config registration.\n\nThe verified registration path on installed Codex 0.157.1 is a CLI session with explicit -c agents.<target>.description and -c agents.<target>.config_file arguments, features.multi_agent=true and features.multi_agent_v2=false. The v1 spawn_agent interface must expose agent_type and advertise the exact target. A controlled native fixture applied the registered instructions and features.shell_tool=false to the child while the parent retained its shell tools. This verifies that reduction, not complete source allowlist equivalence. Recheck support in the installed runtime at use. The v2 spawn interface does not accept agent_type and may inherit parent tools; a task prompt naming a specialist does not bind that role.\n\nIf the current app session cannot select the configured role, use a supported registered CLI child for the dependent phase, with approved inputs and matching or stricter sandbox/approval policy, or STOP that phase. Do not claim a v2 child has the native binding. No automatic personal-agent writes, provider, account, authentication or model changes are part of this recipe.\n\nFirst locate and verify an available Node.js executable with ES-module support; use a verified Codex-bundled Node runtime if available, and do not assume Node is installed on the user PATH. If no suitable runtime is available, STOP before launching the recipe. Keep the actual task project outside the installed package tree. Save the following locally authored recipe as an approved .mjs file. Run it with separately supplied literal arguments: "<NODE_EXE>" "<APPROVED_RECIPE>.mjs" "<CODEX_EXE>" "<PACKAGE>" "<PROJECT>" "<APPROVED_SANDBOX>" "<APPROVED_APPROVAL_POLICY>" "<APPROVED_TASK_FILE>" "<EXACT_TARGET_NAME>" [other approved target names]. Resolve placeholders to concrete paths/settings before use; never interpolate or evaluate source text as shell code. The approved task file must require actual discovery and preflight before using spawn_agent with agent_type set to an exact registered target. This starts a fresh ephemeral CLI session and registers selected roles only for that session, reading the package TOMLs directly; it does not copy or install them.\n\n\`\`\`javascript\n${registrationRecipe()}\n\`\`\`\n\nBefore delegation, verify actual discovery of every selected target name and inspect effective instructions/features. Verify the effective capability mask, inherited MCP tools, full translated body and preload resources/hashes, native call names and manual invocation policy. The recipe verifies generated TOML hashes; successful CLI registration alone does not complete these runtime checks. If the required mask or independent artifact access cannot be established, STOP. A registered TOML with shell_tool=false is a native shell-tool reduction, not an OS sandbox or proof of complete allowlist enforcement. Within that CLI session its children inherit the parent sandbox, approval policy, provider and MCP configuration; validate them against the approved context before work. Never bypass user consent or a denied capability through a relay or child role.\n\nBefore worktree phases, follow the role's concrete Git preflight/create/readback recipe and confirm the delegate's actual working directory. Before memory-dependent phases, read/update the approved private per-project checkpoint. Source model aliases and maxTurns are retained as provenance without automatic target-model/cost/turn-limit equivalence.\n\n| Source role | Native target | Features reduced | Preload calls and resources | Runtime eligibility |\n| --- | --- | --- | --- | --- |\n${manifest.roles.map(role=>`| ${cell(role.sourcePath)} (body: ${cell(role.body.path)}) | ${cell(role.targetName)} (${role.status}) | ${cell(Object.keys(role.featureMask).map(key=>key+'=false').join(', ')||'none')} | ${cell(role.preloads.map(item=>item.nativeCall+' → '+item.resourcePath+(item.manualOnly?' (manual only)':'')).join('; ')||'none')} | ${cell(role.blockers.length?role.blockers.join('; '):'Actual native discovery, original tool mask, preloads, parent permissions'+(role.sourceMetadata.isolation?' and verified Git worktree':'')+(role.sourceMetadata.memory?' and private project checkpoint':''))} |`).join('\n')}\n\nThe machine-readable specialist-bindings.json retains original frontmatter, translated body hashes, source-to-target bindings, all preload resources and mandatory runtime conditions. Regeneration after semantic translation updates only converter-owned, unchanged generated resources.\n`;
}
function registrationRecipe():string {
  return `import {readFileSync, realpathSync} from 'node:fs';
import {join, resolve, relative, isAbsolute, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

export function registerSpecialists(codex, packagePath, projectPath, sandbox, approval, taskPath, names, launch = spawnSync) {
  if (!['read-only', 'workspace-write'].includes(sandbox) || !['untrusted', 'on-request', 'never'].includes(approval)) throw Error('Supply approved sandbox and approval settings; do not broaden the parent policy.');
  if (!names.length || new Set(names).size !== names.length) throw Error('Select exact approved role names once each.');
  const packageDir = realpathSync(packagePath), project = realpathSync(projectPath);
  const projectRel = relative(packageDir, project);
  if (!projectRel || (!isAbsolute(projectRel) && projectRel !== '..' && !projectRel.startsWith('..' + sep))) throw Error('Select a separate task project outside the installed package.');
  const manifest = JSON.parse(readFileSync(join(packageDir, 'codex-compat/specialist-bindings.json'), 'utf8'));
  const args = ['-c', 'features.multi_agent=true', '-c', 'features.multi_agent_v2=false', '-c', 'agents.enabled=true'];
  for (const name of names) {
    const role = manifest.roles.find(item => item.targetName === name);
    if (!role || role.status !== 'conditional' || !/^[a-z0-9-]+$/.test(name) || role.resourcePath !== 'codex-compat/agents/' + name + '.toml') throw Error('Select a valid conditional role.');
    const resource = realpathSync(join(packageDir, role.resourcePath)), rel = relative(packageDir, resource);
    if (rel.startsWith('..') || isAbsolute(rel)) throw Error('Role resource escapes the approved package.');
    const hash = createHash('sha256').update(readFileSync(resource)).digest('hex');
    if (hash !== manifest.generatedFiles[role.resourcePath]) throw Error('Role TOML hash mismatch; review before registration.');
    args.push('-c', 'agents.' + name + '.description=' + JSON.stringify(String(role.sourceMetadata.description)), '-c', 'agents.' + name + '.config_file=' + JSON.stringify(resource));
  }
  const task = readFileSync(realpathSync(taskPath), 'utf8');
  const prompt = 'Before the approved task, read ' + join(packageDir, 'codex-compat/specialists.md') + ' and its binding manifest. Verify actual v1 agent_type discovery, instructions, masks, artifact access, preloads and all role preconditions. Delegate only exact approved registered targets ' + JSON.stringify(names) + '; otherwise STOP the dependent phase. Approved task:\\n' + task;
  args.push('--sandbox', sandbox, '--ask-for-approval', approval, 'exec', '--ephemeral', '--json', '--cd', project, prompt);
  return launch(codex, args, {cwd: project, stdio: 'inherit', shell: false, windowsHide: true});
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [codex, packagePath, projectPath, sandbox, approval, taskPath, ...names] = process.argv.slice(2);
  const result = registerSpecialists(codex, packagePath, projectPath, sandbox, approval, taskPath, names);
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}`;
}
