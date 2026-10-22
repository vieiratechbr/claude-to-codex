import type {BundleFile,Finding,SourceSnapshot} from '../shared/contracts';
import {posix} from 'node:path';
import {activeSkillDetails} from './skill-calls';
import {markdownMetadata,inventorySource} from './inventory';
import {adaptWorkflowText} from './workflow-portability';
import {adaptProjectScripts} from './script-portability';
import {claudeSyntaxMarkers} from './adapters/skills';
import {HELPER_RUNNER_SOURCE} from './helper-runner';
import {classifyResourceRoles} from './resource-roles';
import {EVALUATION_GUIDE} from './evaluation-guide';
import type {WorkflowPortabilityOptions} from './workflow-portability';
type Put=(path:string,data:string|Buffer,sourcePath?:string,replace?:boolean)=>void;
const GUIDE='codex-compat/runtime.md';
const escape=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
// Match complete resource names, including Unicode letters and combining marks;
// an ASCII word boundary can turn a longer project path into a package lookup.
const pathBefore='(?<![\\p{L}\\p{N}\\p{M}_/.-])',pathAfter='(?![\\p{L}\\p{N}\\p{M}_/.-])';
export function isInstructionResource(file:Pick<BundleFile,'path'|'sourcePath'>):boolean{
  return !!file.sourcePath&&/\.md$/i.test(file.path)&&!/(?:^|\/)(?:assets|templates?|fixtures)(?:\/|$)/i.test(file.path)&&(/^skills\/[^/]+\//.test(file.path)||/^source-context\//.test(file.path)&&!/(?:^|\/)(?:README|CHANGELOG|LICENSE|NOTICE)(?:\.md)?$/i.test(file.path));
}
export function prepareWorkflowResources(snapshot:SourceSnapshot,files:Map<string,BundleFile>,put:Put,findings:Finding[],contexts?:Map<string,WorkflowPortabilityOptions>):Set<string>{
  const scripts=adaptProjectScripts(files,put,findings),mapped=Object.fromEntries([...files.values()].filter(file=>file.sourcePath).map(file=>[file.sourcePath!,file.path]));
  // Reconcile only the old location guard for helpers actually handled by the
  // tested script adapter. Unknown anchors retain its blocking finding.
  for(const finding of findings.filter(f=>f.code==='source-script-location'&&f.file?.endsWith('/SKILL.md'))){
    const original=/^O helper (.+?) deriva/.exec(finding.message)?.[1];
    if(original&&scripts.adaptedPaths.includes(mapped[original])){finding.code='project-script-adapted';finding.severity='warning';finding.message='Helper adaptado para receber explicitamente a pasta do projeto: '+original+'. Consulte o contrato de execução e os requisitos antes do uso.';}
  }
  for(const path of ['codex-compat/run-helper.py','codex-compat/scripts.json',GUIDE,'codex-compat/resource-roles.json','codex-compat/evaluation.md'])if(files.has(path)){
    findings.push({code:'runtime-path-collision',severity:'blocking',file:path,message:'A origem ocupa um caminho reservado ao runtime de compatibilidade: '+path});return new Set();
  }
  if(scripts.adaptedPaths.length){
    put('codex-compat/run-helper.py',HELPER_RUNNER_SOURCE);
    put('codex-compat/scripts.json',JSON.stringify(Object.fromEntries(scripts.adaptedPaths.map(path=>[path,files.get(path)!.sha256])),null,2));
  }
  const entries=activeSkillDetails([...files.values()]),calls:Record<string,string>={},sourceFiles=new Map(snapshot.files.map(f=>[f.path,f]));
  const plugins=inventorySource(snapshot).filter(c=>c.kind==='plugin');
  for(const entry of entries){
    const file=files.get(entry.path)!,source=file.sourcePath?sourceFiles.get(file.sourcePath):undefined;let name:string|undefined;
    try{const meta=source&&markdownMetadata(source.data.toString());if(typeof meta?.name==='string')name=meta.name;}catch{}
    const alias=name||posix.basename(posix.dirname(file.sourcePath||entry.path));calls[alias]=entry.name;calls[entry.name]=entry.name;
    const plugin=plugins.filter(p=>!p.root||file.sourcePath?.startsWith(p.root+'/')).sort((a,b)=>b.root.length-a.root.length)[0];if(plugin)calls[plugin.name+':'+alias]=entry.name;
  }
  const projectRoots=new Set(['.',...plugins.map(p=>p.root||'.')]);
  const ownerRoots=[...projectRoots].filter(root=>root!=='.').sort((a,b)=>b.length-a.length);
  const projectArtifact=(source:string)=>{
    // A marketplace may contain several independent project layouts, and a
    // nested plugin owns its resources even when its parent directory is design/.
    const owner=ownerRoots.find(root=>source.startsWith(root+'/'));
    const relative=owner?source.slice(owner.length+1):source;
    return /^(?:design|production|assets|src|source|scenes|addons|tests?)\/|^docs\/(?:architecture|registry|engine-reference)\//i.test(relative)||/(?:^|\/)(?:project(?:\.local)?\.ya?ml|technical-preferences\.md)$/i.test(relative);
  };
  const staticMap=Object.fromEntries(Object.entries(mapped).filter(([source])=>!projectArtifact(source)));
  for(const file of [...files.values()].filter(file=>file.sourcePath&&/\.md$/i.test(file.path))){
    const original=file.data.toString();
    const text=original.replace(/(\[[^\]\n]*\]\()(<[^>\n]+>|[^\s)]+)(\))/g,(whole,prefix:string,url:string,suffix:string)=>{
      const raw=url.replace(/^<|>$/g,'');if(/^(?:[a-z]+:|\/|#)/i.test(raw))return whole;
      try{
        const [path,fragment='']=raw.split(/(?=#)/,2),decoded=decodeURIComponent(path);
        const present=posix.normalize(posix.join(posix.dirname(file.path),decoded));
        if(files.has(present))return prefix+decoded.split('/').map(encodeURIComponent).join('/')+fragment+suffix;
        const source=posix.normalize(posix.join(posix.dirname(file.sourcePath!),decoded)),target=mapped[source];
        if(!target)return whole;
        return prefix+posix.relative(posix.dirname(file.path),target).split('/').map(encodeURIComponent).join('/')+fragment+suffix;
      }catch{return whole;}
    });
    if(text!==original)put(file.path,text,file.sourcePath,true);
  }
  const roles=classifyResourceRoles(snapshot,[...files.values()]);
  put('codex-compat/resource-roles.json',JSON.stringify({version:1,instructions:[...roles.instructions].sort(),evaluations:[...roles.evaluations].sort(),provenance:[...roles.provenance].sort()},null,2));
  put('codex-compat/evaluation.md',EVALUATION_GUIDE);
  const semanticPaths=new Set<string>(),installedResourcePaths=[...files.keys()];let used=false;
  for(const file of [...files.values()].filter(file=>isInstructionResource(file)&&roles.instructions.has(file.path))){
    const skillRoot=/^skills\/[^/]+/.exec(file.path)?.[0],entry=skillRoot?files.get(skillRoot+'/SKILL.md'):undefined;
    const sourceSkill=entry?.sourcePath||file.sourcePath!,sourceDir=posix.dirname(sourceSkill);
    const original=file.data.toString(),header=/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(original)?.[0]||'';
    let text=original.slice(header.length),changedPreparation=false;
    const links:string[]=[];
    text=text.replace(/\[[^\]\n]*\]\((?:<[^>\n]+>|[^)\n]+)\)/g,link=>{links.push(link);return 'C2C_LINK_RESOURCE_'+(links.length-1)+'_END';});
    text=text.replace(/\$\{CLAUDE_SKILL_DIR\}((?:\/[^\s"'`<>);|&]*)?)/g,(whole,tail:string)=>{
      const source=posix.normalize(posix.join(sourceDir,tail.replace(/^\//,'')));
      if(projectRoots.has(source))return '${C2C_PROJECT_ROOT}';
      if(!tail&&skillRoot)return '${C2C_RESOURCE_ROOT}/'+skillRoot;
      if(mapped[source])return '${C2C_RESOURCE_ROOT}/'+mapped[source];return whole;
    }).replace(/\$\{CLAUDE_PROJECT_DIR\}/g,'${C2C_PROJECT_ROOT}');
    for(const [source,target] of Object.entries(mapped).filter(([source])=>/\.(?:sh|bash)$/.test(source)).sort(([a],[b])=>b.length-a.length)){
      text=text.replace(new RegExp(pathBefore+escape(source)+pathAfter,'gu'),()=> '${C2C_RESOURCE_ROOT}/'+target);
    }
    for(const [source,target] of Object.entries(staticMap).filter(([source])=>/\.gd$/.test(source))){
      text=text.replace(new RegExp('((?:--script|-s)\\s+)(?:"res://'+escape(source)+'"|res://'+escape(source)+')(?![\\w/.-])','g'),(_whole,prefix:string)=>prefix+'"${C2C_RESOURCE_ROOT}/'+target+'"');
    }
    for(const [source,target] of Object.entries(staticMap).filter(([source,target])=>target.startsWith('source-context/')&&!/\.(?:sh|bash)$/.test(source)).sort(([a],[b])=>b.length-a.length)){
      text=text.replace(new RegExp(pathBefore+escape(source)+pathAfter,'gu'),()=>target);
    }
    for(const path of [...scripts.adaptedPaths].sort((a,b)=>b.length-a.length)){
      // Registered paths supply the full operand, rather than an ASCII token
      // prefix. Match both original quoting styles and preserve the remaining
      // argument text exactly; never interpret or execute the source command.
      const operand=escape('${C2C_RESOURCE_ROOT}/'+path);
      const command=new RegExp(pathBefore+'bash[ \\t]+(?:"'+operand+'"|\''+operand+'\'|'+operand+')(?=$|[\\s;&|)`])','gmu');
      text=text.replace(command,()=> 'python "${C2C_RESOURCE_ROOT}/codex-compat/run-helper.py" --project "${C2C_PROJECT_ROOT}" --script "'+path+'" --');
    }
    text=text.replace(/\bsource\s+(\$\{C2C_RESOURCE_ROOT\}\/[^\s"'`;&|()]+)/g,'source "$1"');
    text=text.replace(/(`{3,}|~{3,})(bash|sh|shell)[ \t]*\r?\n([\s\S]*?)\r?\n\1/g,(whole,fence:string,language:string,program:string)=>{
      for(const target of Object.values(staticMap).filter(path=>path.startsWith('source-context/')).sort((a,b)=>b.length-a.length)){
        program=program.replace(new RegExp('(["\'])\\$\\{C2C_RESOURCE_ROOT\\}/'+escape(target)+'\\1','g'),()=> '"${C2C_RESOURCE_ROOT}/'+target+'"');
        program=program.replace(new RegExp(pathBefore+'(["\']?)'+escape(target)+'\\1'+pathAfter,'gu'),(whole,_quote:string,offset:number)=>
          scripts.adaptedPaths.includes(target)&&/--script\s*$/.test(program.slice(0,offset))?whole:'"${C2C_RESOURCE_ROOT}/'+target+'"');
      }
      return fence+language+'\n'+program+'\n'+fence;
    });
    text=text.replace(/!`([^`\n]+)`/g,(_whole,original:string)=>{
      let command=original;
      command=command.replace(/^bash\s+"\$\{C2C_RESOURCE_ROOT\}\/([^"\n]+)"(?:\s+([\s\S]*))?$/,(whole,path:string,args:string)=>scripts.adaptedPaths.includes(path)?'python "${C2C_RESOURCE_ROOT}/codex-compat/run-helper.py" --project "${C2C_PROJECT_ROOT}" --script "'+path+'" -- '+(args||''):whole);
      changedPreparation=true;return '\nBefore using the following context, load the runtime contract, select the actual project, and execute this preparation only at skill-use time under session permissions. Capture the real output; if unavailable, report the unmet requirement and do not fabricate values. Never execute it during download or conversion.\n\n```sh\n'+command+'\n```\n';
    });
    text=text.replace(/^([ \t]*)@([^\s]+\.(?:md|markdown))[ \t]*$/gm,(whole,indent:string,path:string)=>{
      const source=staticMap[path]?path:posix.normalize(posix.join(posix.dirname(file.sourcePath!),path));
      return staticMap[source]?indent+'Explicitly load the conventions from '+staticMap[source]+' at this position; retain original scope and precedence.':whole;
    });
    const context={sourcePath:file.sourcePath!,targetPath:file.path,skillCalls:calls,sourceToTarget:staticMap,projectPaths:Object.keys(mapped).filter(projectArtifact),installedResourcePaths};contexts?.set(file.path,context);
    text=text.replace(/C2C_LINK_RESOURCE_(\d+)_END/g,(_match,index:string)=>links[Number(index)]);
    const result=adaptWorkflowText(header+text,context);text=result.text;
    if(result.installedWritePaths.length)contexts?.set(file.path,{...context,requiredMutableResources:result.installedWritePaths});
    findings.push(...result.findings);
    if(changedPreparation)findings.push({code:'explicit-context-preparation',severity:'warning',file:file.path,message:'O contexto dinâmico foi convertido em preparação explícita durante uso, com pasta de projeto e permissões da sessão.'});
    used||=changedPreparation||text!==file.data.toString()||scripts.adaptedPaths.length>0;
    put(file.path,text,file.sourcePath,true);
    if(result.semanticNeeded||claudeSyntaxMarkers(text).length)semanticPaths.add(file.path);
  }
  if(used){
    put(GUIDE,['# Runtime contract for converted workflows','','The installed package and the user project are separate roots. Package files are read-only runtime resources; approved output, configuration and project instruction changes belong to the selected project. Never edit installed cache resources to change project settings or skill behavior. Resolve this package from the absolute installed SKILL.md location advertised by Codex: skills/<name>/SKILL.md is below the package root. Confirm its .codex-plugin/plugin.json. Never choose the package/cache tree as the working project. Paths beginning source-context/ or skills/ in these resources are relative to the installed package, not the project.','','Before preparation commands, explicitly select the actual project and set C2C_PROJECT_ROOT to its absolute directory and C2C_RESOURCE_ROOT to this package root in the same execution environment. These are variables supplied by this compatibility layer, not native Codex variables. Prefer the generated runner for registered shell helpers:','','```text','python <absolute-package>/codex-compat/run-helper.py --project <absolute-project> --script <registered-bundle-path> -- <literal-arguments>','```','','Use `python <absolute-package>/codex-compat/run-helper.py --runtime-info` to obtain the verified absolute GNU Bash and Python paths without running an imported helper. The runner requires Python 3 and discovers a verified GNU shell, including Git for Windows or the bundled Codex Git runtime; a bare bash command need not be on PATH. For a sourced library function, add --function <function-name> before -- and pass literal arguments. It sets the project cwd, rejects the installed tree as a project, and checks the helper hash. Pass arguments as an array through the session execution tool; do not concatenate untrusted shell command text. For compound shell examples, invoke that absolute verified Bash with --noprofile --norc and -c, supplying the program as one literal argument through the session tool and the same explicit project/resource environment. Source library paths must be quoted. If a helper input contains project wildcards, either use that verified shell for the original expansion or enumerate matching project files before passing literal argv; never report a successful check of an unresolved pattern. Plain bash need not be on PATH.','','Read project.yaml, project.local.yaml, project-local preferences, design/, production/, assets/ and source files from the selected project. Bundled copies are templates/evidence only, never the current project values. Load the package conventions and applicable project AGENTS.md explicitly, preserving private/local scope and precedence; do not overwrite an existing AGENTS.md. Source hooks are inactive resources and are never registered automatically.','','Consult [resource-roles.json](resource-roles.json) before treating a preserved document as an instruction. Only the selected workflows and their operational dependency closure are executable instructions. Upstream administrative guides, historical release procedures and unrelated host setup are provenance; do not apply their installation, permission or event-registration commands to the target. Catalog specifications are evaluation data. When testing, improving or maintaining skills, read [evaluation.md](evaluation.md) for target assertion predicates, real evidence and the approved project-local catalog/results lifecycle. Never turn a negative fixture into a required package dependency or waive a substantive test.', '', 'Respect the workflow mode, manual invocation policy, actual user replies and write scope. Displayed, dismissed or empty questions do not authorize writes. Independent review requires actual clean-context delegation or an explicit handoff to a fresh chat with artifact-only inputs; never simulate results or claim a separate sandbox from prose. Save approved progress and checkpoints before compaction/session handoff. Do not invent context percentages or runtime availability.','','No imported code executes during acquisition, inventory or conversion. Runtime dependencies and essential phase-specific capabilities must be checked before that phase. Report an unavailable runtime honestly and retain saved progress.'].join('\n')+'\n');
    for(const entry of entries){
      const file=files.get(entry.path)!;const original=file.data.toString(),link=posix.relative(posix.dirname(entry.path),GUIDE);
      const header=/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(original)?.[0]||'';
      put(entry.path,header+'\nBefore this workflow, read [the converted runtime contract]('+link+') and resolve the installed package and actual project separately.\n\n'+original.slice(header.length),file.sourcePath,true);
    }
  }
  return semanticPaths;
}
