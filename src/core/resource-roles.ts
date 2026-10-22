import {posix} from 'node:path';
import {parse} from 'yaml';
import type {BundleFile,SourceSnapshot} from '../shared/contracts';

const markdown=/\.(?:md|markdown)$/i;
const examplePath=/(?:^|\/)(?:assets|templates?|fixtures)(?:\/|$)/i;
const contextMap=/(?:^|\/)source-context-map\.md$/i;
const administrative=/^(?:README|CHANGELOG|LICENSE|NOTICE|UPGRADING|CONTRIBUTING|SECURITY)(?:\.md|\.markdown)?$/i;

function outsideFences(text:string):string{
  let fence:{marker:string;length:number}|undefined;
  return text.split(/(?<=\n)/).map(line=>{
    const match=/^[ \t]*(?:>[ \t]*)*(`{3,}|~{3,})([^\r\n]*)/.exec(line);
    if(fence){
      if(match&&match[1][0]===fence.marker&&match[1].length>=fence.length&&!match[2].trim())fence=undefined;
      return '\n';
    }
    if(match&&!(match[1][0]==='`'&&match[2].includes('`'))){fence={marker:match[1][0],length:match[1].length};return '\n';}
    return line;
  }).join('');
}

function localPath(value:string):string|undefined{
  let path=value.trim().replace(/^@/,'').replace(/^<|>$/g,'').replace(/^(["'])([\s\S]*)\1$/,'$2');
  if(!path||/^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(path))return;
  try{path=decodeURIComponent(path.split(/[?#]/,1)[0]);}catch{return;}
  if(/[\0\r\n*<>]|\$\(|\[|\]/.test(path))return;
  return path;
}

// Recognize literal operands only. A directory listing, glob, fenced sample or
// generated preservation index must never activate its whole contents.
function markdownReferences(body:string):string[]{
  let text=outsideFences(body);
  const paths=new Set<string>(),add=(value:string)=>{const path=localPath(value);if(path&&markdown.test(path))paths.add(path);};
  text=text.replace(/!?\[[^\]\n]*\]\(\s*(<[^>\n]+>|[^)\n]+)\)/g,(_whole,destination:string)=>{
    add(destination.replace(/\s+(?:"[^"]*"|'[^']*')\s*$/,''));return ' ';
  });
  text=text.replace(/^[ \t]{0,3}\[[^\]\n]+\]:\s*(<[^>\n]+>|[^\n]+)$/gm,(_whole,destination:string)=>{
    add(destination.replace(/\s+(?:"[^"]*"|'[^']*')\s*$/,''));return ' ';
  });
  text=text.replace(/`+([^`\n]+)`+/g,(_whole,value:string)=>{add(value);return ' ';});
  text=text.replace(/(["'])([^"'\n]+)\1/g,(_whole,_quote:string,value:string)=>{add(value);return ' ';});
  for(const match of text.matchAll(/(?<![\p{L}\p{N}_./%:-])@?(?:\.{1,2}\/)?(?:[\p{L}\p{N}_.%-]+\/)*[\p{L}\p{N}_.%-]+\.(?:md|markdown)(?:[?#][^\s<>`"'\])]+)?(?![\p{L}\p{N}_./%-])/giu))add(match[0]);
  return [...paths];
}

function declaredMarkdownReferences(body:string):{paths:string[];families:{directory:string;extension:string}[]}{
  const text=outsideFences(body),operands:string[]=[];
  for(const match of text.matchAll(/`+([^`\n]+)`+/g))operands.push(match[1]);
  for(const match of text.matchAll(/(["'])([^"'\n]+)\1/g))operands.push(match[2]);
  for(const match of text.matchAll(/(?<![\p{L}\p{N}_./%:-])(?:\.{1,2}\/)?(?:[\p{L}\p{N}_.%-]+\/)+(?:<[\p{L}\p{N}_-]+>|\[[\p{L}\p{N}_-]+\])\.(?:md|markdown)/giu))operands.push(match[0]);
  for(const match of text.matchAll(/(?<![\p{L}\p{N}_./%:-])(?:\.{1,2}\/)?(?:[\p{L}\p{N}_.%-]+\/)+(?=$|[\s`"';|)<>])/giu))operands.push(match[0]);
  const directories=new Set<string>(),families:{directory:string;extension:string}[]=[];
  for(const operand of operands){
    const family=/^(.*\/)(?:<[\p{L}\p{N}_-]+>|\[[\p{L}\p{N}_-]+\])(\.(?:md|markdown))$/iu.exec(operand);
    if(family){const directory=localPath(family[1]);if(directory)families.push({directory,extension:family[2].toLowerCase()});}
    const directory=localPath(operand);if(directory?.endsWith('/'))directories.add(directory);
  }
  // A table's concrete basenames belong to its explicitly declared directory.
  // Bare directory mentions alone still do not activate an inventory.
  const rows=text.split('\n').filter(line=>/^\s*\|.*\|\s*$/.test(line)).join('\n');
  const basenames=markdownReferences(rows).filter(path=>posix.basename(path)===path);
  return{paths:[...directories].flatMap(directory=>basenames.map(name=>posix.join(directory,name))),families};
}

/** Classify preserved resources by their operative dependency graph, not extension. */
export function classifyResourceRoles(snapshot:SourceSnapshot,files:readonly BundleFile[]):{instructions:Set<string>;evaluations:Set<string>;provenance:Set<string>}{
  const instructions=new Set<string>(),evaluations=new Set<string>();
  const sources=new Map(snapshot.files.map(file=>[file.path,file]));
  const targets=new Map(files.map(file=>[file.path,file]));
  const sourceTargets=new Map<string,BundleFile[]>();
  for(const file of files)if(file.sourcePath){const siblings=sourceTargets.get(file.sourcePath)||[];siblings.push(file);sourceTargets.set(file.sourcePath,siblings);}
  const sourceDirectories=new Map<string,string[]>();
  for(const path of sources.keys())if(markdown.test(path)){const directory=posix.dirname(path),siblings=sourceDirectories.get(directory)||[];siblings.push(path);sourceDirectories.set(directory,siblings);}
  const roots=new Set(['.']);
  for(const path of sources.keys()){
    const manifest=/(?:^|\/)\.(?:claude|codex)-plugin\/plugin\.json$/.exec(path);
    if(manifest)roots.add(path.slice(0,manifest.index)||'.');
    const control=/(?:^|\/)\.(?:claude|agents)\//.exec(path);
    if(control)roots.add(path.slice(0,control.index)||'.');
  }
  const owners=[...roots].filter(root=>root!=='.').sort((a,b)=>b.length-a.length);
  const owner=(path:string)=>owners.find(root=>path.startsWith(root+'/'))||'.';
  const safe=(path:string)=>path!=='.'&&!posix.isAbsolute(path)&&path!=='..'&&!path.startsWith('../');
  const candidates=(raw:string,path:string)=>[posix.join(posix.dirname(path),raw),posix.join(owner(path),raw),posix.normalize(raw)].filter(safe);
  const evaluationSources=new Set<string>(),frameworkRoots=new Set<string>();
  // YAML is parsed as data with bounded aliases. Only declared spec operands
  // establish evaluation documents; their prose is never a command graph.
  for(const source of snapshot.files.filter(file=>/(?:^|\/)catalog\.ya?ml$/i.test(file.path))){
    try{
      const catalog=parse(source.data.toString(),{maxAliasCount:20});
      if(!catalog||typeof catalog!=='object')continue;
      for(const collection of [catalog.skills,catalog.agents])if(Array.isArray(collection))for(const entry of collection){
        if(!entry||typeof entry!=='object'||typeof entry.spec!=='string'||!entry.spec.trim())continue;
        const raw=localPath(entry.spec);if(!raw)continue;
        evaluationSources.add(source.path);
        const directory=posix.dirname(source.path);if(directory!=='.')frameworkRoots.add(directory);
        const resolved=[posix.join(owner(source.path),raw),...candidates(raw,source.path)].filter(safe).find(path=>sources.has(path));
        if(resolved)evaluationSources.add(resolved);
      }
    }catch{/* Malformed catalogs are reported by acquisition/conversion validation. */}
  }
  for(const path of evaluationSources)for(const file of sourceTargets.get(path)||[])evaluations.add(file.path);
  const administrativeSource=(path:string)=>roots.has(posix.dirname(path))&&administrative.test(posix.basename(path));
  const excluded=(path:string)=>examplePath.test(path)||contextMap.test(path)||administrativeSource(path)||evaluationSources.has(path);
  const queue:{sourcePath?:string;targetPath?:string}[]=[],seenSources=new Set<string>(),seenTargets=new Set<string>();
  const activateSource=(path:string)=>{
    if(seenSources.has(path)||!markdown.test(path)||excluded(path))return;
    seenSources.add(path);
    for(const file of sourceTargets.get(path)||[])if(!evaluations.has(file.path)&&!examplePath.test(file.path)&&!contextMap.test(file.path))instructions.add(file.path);
    queue.push({sourcePath:path});
  };
  const activateTarget=(file:BundleFile)=>{
    if(file.sourcePath){activateSource(file.sourcePath);return;}
    // Own generated runtime/index documents are not source instructions.
    if(!/^skills\/[^/]+\/SKILL\.md$/.test(file.path)||seenTargets.has(file.path))return;
    seenTargets.add(file.path);instructions.add(file.path);queue.push({targetPath:file.path});
  };
  for(const file of files){
    if(!markdown.test(file.path)||examplePath.test(file.path)||contextMap.test(file.path))continue;
    const source=file.sourcePath;
    const skill=/^skills\/[^/]+\/(?:SKILL\.md$|references\/)/.test(file.path);
    const role=source&&/(?:^|\/)\.(?:claude|agents)\/agents\/[^/]+\.md$/i.test(source);
    const control=source&&(/(?:^|\/)CLAUDE\.md$/i.test(source)||/(?:^|\/)\.claude\/rules\/.+\.md$/i.test(source));
    const framework=source&&[...frameworkRoots].some(root=>source.startsWith(root+'/'));
    if(skill||role||control&&!framework)activateTarget(file);
  }
  const follow=(raw:string,sourcePath:string|undefined,targetPath:string|undefined,current:boolean)=>{
    // These conventional anchors are literal paths; no source expressions run.
    if(raw.startsWith('${CLAUDE_SKILL_DIR}/')){
      if(sourcePath){const entry=/(^|\/)skills\/[^/]+\//.exec(sourcePath);if(entry)raw=posix.join(sourcePath.slice(0,entry.index+entry[0].length),raw.slice('${CLAUDE_SKILL_DIR}/'.length));}
    }else if(raw.startsWith('${C2C_RESOURCE_ROOT}/'))raw=raw.slice('${C2C_RESOURCE_ROOT}/'.length);
    if(raw.includes('$'))return;
    const sourceCandidates=sourcePath?candidates(raw,sourcePath):[posix.normalize(raw)].filter(safe);
    const targetCandidates=[...(targetPath?[posix.join(posix.dirname(targetPath),raw)]:[]),posix.normalize(raw)].filter(safe);
    const source=()=>{const path=sourceCandidates.find(path=>sources.has(path)||sourceTargets.has(path));if(path){activateSource(path);return true;}return false;};
    const target=()=>{const file=targetCandidates.map(path=>targets.get(path)).find(Boolean);if(file){activateTarget(file);return true;}return false;};
    if(current){if(!target())source();}else if(!source())target();
  };
  const visit=(body:string,sourcePath:string|undefined,targetPath:string|undefined,current:boolean)=>{
    const declarations=declaredMarkdownReferences(body);
    for(const raw of [...markdownReferences(body),...declarations.paths])follow(raw,sourcePath,targetPath,current);
    // A literal directory plus a basename placeholder explicitly declares a
    // conditional resource family. Include its direct concrete source files,
    // without recursive globbing, source execution or unrelated directory scans.
    for(const family of declarations.families){
      const sourcePaths=()=>{
        const directories=sourcePath?candidates(family.directory,sourcePath):[posix.normalize(family.directory)].filter(safe);
        return directories.map(directory=>(sourceDirectories.get(directory.replace(/\/+$/,''))||[]).filter(path=>path.toLowerCase().endsWith(family.extension))).find(paths=>paths.length)||[];
      };
      const targetPaths=current?[...(targetPath?[posix.join(posix.dirname(targetPath),family.directory)]:[]),posix.normalize(family.directory)].filter(safe).map(directory=>files.filter(file=>file.sourcePath&&sources.has(file.sourcePath)&&posix.dirname(file.path)===directory.replace(/\/+$/,'')&&file.path.toLowerCase().endsWith(family.extension))).find(matches=>matches.length)?.map(file=>file.sourcePath!)||[]:[];
      for(const path of targetPaths.length?targetPaths:sourcePaths())activateSource(path);
    }
  };
  for(let index=0;index<queue.length;index++){
    const {sourcePath,targetPath}=queue[index];
    const original=sourcePath&&sources.get(sourcePath);
    if(original)visit(original.data.toString(),sourcePath,undefined,false);
    const installed=sourcePath?sourceTargets.get(sourcePath)||[]:targetPath?[targets.get(targetPath)!]:[];
    for(const file of installed)visit(file.data.toString(),sourcePath,file.path,true);
  }
  return{instructions,evaluations,provenance:new Set(files.filter(file=>!instructions.has(file.path)&&!evaluations.has(file.path)).map(file=>file.path))};
}
