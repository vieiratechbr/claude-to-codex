import {posix} from 'node:path';
import type {BundleFile,Finding} from '../shared/contracts';

export interface ScriptPortabilityReport {
  adaptedPaths:string[];
  unresolvedPaths:string[];
  resourceRewrites:number;
}
type Put=(path:string,data:string|Buffer,sourcePath?:string,replace?:boolean)=>void;
const MARKER='# C2C project-script portability v1';
const SELF=String.raw`\$\(\s*dirname[ \t]+"(?:\$0|\$\{BASH_SOURCE\[0\]\})"[ \t]*\)`;
const ANCESTOR_CD=new RegExp(String.raw`\bcd[ \t]+"${SELF}(?:/\.\.)+"`,'g');
const LOCATION=/(?:\b(?:dirname|realpath|readlink)[^\n]*(?:BASH_SOURCE|\$0)|\$\{(?:0|BASH_SOURCE(?:\[0\])?)[%#])/;
const escape=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const shellLiteral=(value:string)=>"'"+value.replace(/'/g,"'\\''")+"'";

/** Prove the narrow directory-anchor contract used by split project/resource
 * helpers. Ancestor cd selects the caller's project; every other use must be
 * a mapped installed file consumed by a recognized read/import operation.
 * Unknown commands, destinations, computed suffixes and moved siblings fail
 * closed. This is static recognition, never shell evaluation.
 */
function sharedDirectoryAnchors(original:string,file:BundleFile,mapped:BundleFile[]):{text:string;handled:Set<string>}{
  const declaration=new RegExp(String.raw`^\s*(?:local[ \t]+)?([A-Za-z_]\w*)="\$\(cd[ \t]+"${SELF}"(?:[ \t]+2>/dev/null)?[ \t]+&&[ \t]+pwd(?:[ \t]+-[A-Za-z]+)?\)"[ \t]*$`);
  const candidates=original.split('\n').map(line=>({line,match:declaration.exec(line)})).filter(x=>x.match);
  const handled=new Set<string>();let text=original;
  const variable=(name:string)=>String.raw`(?:\$\{${name}\}|\$${name}(?![A-Za-z0-9_]))`;
  for(const candidate of candidates){
    const name=candidate.match![1],reference=variable(name);
    text=text.replace(new RegExp(String.raw`\bcd[ \t]+"${reference}(?:/\.\.)+"`,'g'),'cd "$C2C_PROJECT_ROOT"');
  }
  function prove(name:string,declarationLine:string,source:string,installed:string,isDirectory:boolean,seen:Set<string>):boolean{
    if(seen.has(name))return false;
    const next=new Set(seen);next.add(name);
    const reference=variable(name),argument=String.raw`"(${reference}(?:/[^"$\x60\n]*)?)"`;
    const resolve=(value:string):BundleFile|undefined=>{
      const suffix=value.replace(new RegExp('^'+reference),'');
      if(!isDirectory&&suffix)return undefined;
      const sourceTarget=isDirectory?posix.normalize(source+suffix):source;
      const installedTarget=isDirectory?posix.normalize(installed+suffix):installed;
      return mapped.find(resource=>resource.sourcePath===sourceTarget&&resource.path===installedTarget);
    };
    let proof=text.split('\n').filter(line=>line!==declarationLine&&!/^\s*#/.test(line)).join('\n');
    // Static aliases retain the same read-only proof, including multiline awk
    // programs that read immutable shell constants or documentation.
    const aliases=new RegExp(String.raw`^[ \t]*(?:local[ \t]+)?([A-Za-z_]\w*)=${argument}[ \t]*$`,'gm');
    proof=proof.replace(aliases,(whole,alias:string,value:string)=>{
      const resource=resolve(value);
      return resource&&prove(alias,whole,resource.sourcePath!,resource.path,false,next)?'':whole;
    });
    const consume=(pattern:string,kind?:'shell')=>{
      proof=proof.replace(new RegExp(pattern,'g'),(whole,value:string)=>{
        const resource=resolve(value);
        if(!resource||kind==='shell'&&!/\.(?:sh|bash)$/.test(resource.path))return whole;
        return whole.replace('"'+value+'"',"'C2C_REVIEWED_RESOURCE'");
      });
    };
    consume(String.raw`\[[ \t]+(?:![ \t]+)?-[frs][ \t]+${argument}(?=[ \t]+\])`);
    consume(String.raw`\b(?:source|bash)[ \t]+${argument}`,'shell');
    consume(String.raw`(?:^|[;&|])[ \t]*\.[ \t]+${argument}`,'shell');
    consume(String.raw`\bawk[ \t]+-f[ \t]+${argument}`);
    consume(String.raw`\bawk[ \t]+[^\n';|&]*'[^']*'[ \t]+${argument}`);
    consume(String.raw`\bsed[ \t]+-n[ \t]+'[^'\n]*'[ \t]+${argument}`);
    // Literal diagnostic echo arguments do not read or write their mentions.
    proof=proof.replace(/\becho[ \t]+"[^"`\n]*"/g,whole=>whole.includes('$(')?whole:'');
    return !new RegExp(reference).test(proof);
  }
  for(const {line,match} of candidates){
    if(prove(match![1],line,posix.dirname(file.sourcePath!),posix.dirname(file.path),true,new Set()))handled.add(line);
  }
  return {text,handled};
}

function projectGuard(path:string):string {
  const up=posix.relative(posix.dirname(path),'.')||'.';
  return [MARKER,
    'if [ -z "${C2C_PROJECT_ROOT:-}" ] || [ ! -d "$C2C_PROJECT_ROOT" ]; then',
    '  echo "C2C_PROJECT_ROOT must explicitly select an existing project directory" >&2',
    '  return 2 2>/dev/null || exit 2','fi',
    'C2C_PROJECT_ROOT="$(cd "$C2C_PROJECT_ROOT" && pwd -P)" || { return 2 2>/dev/null || exit 2; }',
    'C2C_RESOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/'+up+'" && pwd -P)" || { return 2 2>/dev/null || exit 2; }',
    '_c2c_probe="$C2C_PROJECT_ROOT"',
    'while [ -n "$_c2c_probe" ]; do',
    '  if [ "$_c2c_probe" -ef "$C2C_RESOURCE_ROOT" ]; then',
    '    echo "C2C_PROJECT_ROOT cannot select the installed resource tree" >&2',
    '    return 2 2>/dev/null || exit 2',
    '  fi',
    '  _c2c_parent="$(dirname "$_c2c_probe")"',
    '  [ "$_c2c_parent" = "$_c2c_probe" ] && break',
    '  _c2c_probe="$_c2c_parent"',
    'done',
    'export C2C_PROJECT_ROOT C2C_RESOURCE_ROOT',
    'CLAUDE_PROJECT_DIR="$C2C_PROJECT_ROOT"; export CLAUDE_PROJECT_DIR',
    'cd "$C2C_PROJECT_ROOT" || { return 2 2>/dev/null || exit 2; }',''].join('\n');
}

/**
 * Statically adapts preserved shell resources; never executes package code.
 * Caller must supply C2C_PROJECT_ROOT at each use (including sourceable use).
 * Returns paths whose project-location anchors are fully handled, and paths
 * requiring review. Unknown anchors retain original bytes and a blocker.
 * `put` must replace entries in `files`, as conversion's normal put does.
 * Original sourcePath is retained for the snapshot/recovery provenance.
 */
export function adaptProjectScripts(files:Map<string,BundleFile>,put:Put,findings:Finding[]):ScriptPortabilityReport {
  const report:ScriptPortabilityReport={adaptedPaths:[],unresolvedPaths:[],resourceRewrites:0};
  const mapped=[...files.values()].filter(f=>f.sourcePath);
  const resources=mapped.filter(f=>/\.(?:sh|bash)$/.test(f.sourcePath!)||/\/workflow-catalog\.ya?ml$/.test(f.sourcePath!));
  for(const file of mapped.filter(f=>/\.(?:sh|bash)$/.test(f.path))){
    const guard=projectGuard(file.path);
    const alreadyGuarded=file.data.toString().includes(guard);
    const directoryAnchors=sharedDirectoryAnchors(file.data.toString().replace(guard,''),file,mapped);
    const original=directoryAnchors.text;
    const sourceRootSelector=/^[ \t]*--root\)[^\n]*\bROOT_ARG="\$2"/m.test(original)
      ||/^[ \t]*--root=\*\)[^\n]*\bROOT_ARG="\$\{1#--root=\}"/m.test(original);
    let unresolved=false,rewrites=0;
    const body=original.split('\n').map(line=>{
      if(/^\s*#/.test(line))return line;
      if(LOCATION.test(line)){
        if(directoryAnchors.handled.has(line))return line;
        // Directory anchors used exclusively for installed sibling imports are
        // resource anchors; they must continue to follow BASH_SOURCE/$0.
        const assignment=/^\s*(?:local\s+)?([A-Za-z_]\w*)=/.exec(line);
        const resourceVar=assignment?.[1];
        const uses=resourceVar?original.split('\n').filter(l=>!/^\s*#/.test(l)&&l!==line&&new RegExp(String.raw`\$\{?${escape(resourceVar)}\b`).test(l)):[];
        const simpleResourceAssignment=new RegExp(String.raw`^\s*(?:local[ \t]+)?[A-Za-z_]\w*="(?:\$\(cd[ \t]+"${SELF}(?:/[^"$]+)?"(?:[ \t]+2>/dev/null)?[ \t]+&&[ \t]+pwd(?:[ \t]+-[A-Za-z]+)?\)|${SELF}(?:/[^"$]+)?)"[ \t]*$`).test(line);
        const sourceOnly=simpleResourceAssignment&&uses.length>0&&uses.every(l=>/^\s*(?:source|\.)\s+(?:"[^"\n]+"|'[^'\n]+'|[^\s;&|]+)(?:\s+2>\/dev\/null)?\s*$/.test(l));
        const directSibling=new RegExp(String.raw`^\s*(?:source|\.)[ \t]+"${SELF}/[^"$]+"(?:[ \t]+2>/dev/null)?[ \t]*$`).test(line);
        if(sourceOnly||directSibling)return line;
        const rewritten=line.replace(ANCESTOR_CD,'cd "$C2C_PROJECT_ROOT"');
        if(rewritten===line||LOCATION.test(rewritten))unresolved=true;
        line=rewritten;
      }
      // The host payload is informative, never an override of the explicitly
      // selected project. This is a narrow recognized cwd fallback contract.
      line=line.replace(/\[ -z "\$cwd" \] && cwd="\."/g,'cwd="$C2C_PROJECT_ROOT"');
      // A preserved --root parser must not override the host's project after
      // its guard ran, or nested helpers and their parent would use different
      // projects. Directory identity accepts physical aliases and junctions.
      if(sourceRootSelector)line=line.replace(/\bcd[ \t]+"\$ROOT_ARG"/g,
        '[ "$ROOT_ARG" -ef "$C2C_PROJECT_ROOT" ] || { echo "Source --root must match C2C_PROJECT_ROOT; select another project with --project" >&2; return 2 2>/dev/null || exit 2; }; cd "$C2C_PROJECT_ROOT"');
      // Windows also ships timeout.exe, with an incompatible argument contract.
      // Keep the source's stdin fallback when the POSIX utility is unavailable.
      line=line.replace(/if command -v timeout >\/dev\/null 2>&1; then/g,
        "if command -v timeout >/dev/null 2>&1 && timeout --version 2>/dev/null | grep -q 'GNU coreutils'; then");
      // Source helpers sometimes render their own leading comments as --help.
      // The injected guard shifts original lines after the shebang, so retain
      // those existing ranges instead of accidentally printing guard code.
      if(!alreadyGuarded){
        const shift=guard.split('\n').length-1;
        line=line.replace(/sed[ \t]+-n[ \t]+(["'])(\d+),(\d+|\/[^"'\n]+\/)p\1[ \t]+"\$0"/g,(match,quote,start,end)=>{
          if(Number(start)<(original.startsWith('#!')?2:1))return match;
          return 'sed -n '+quote+(Number(start)+shift)+','+(/^\d+$/.test(end)?Number(end)+shift:end)+'p'+quote+' "$0"';
        });
      }
      // Only executable resource lookups, not prose or legacy project data.
      if(!/(?:^\s*(?:if\b|\[|source\b|\.\s|(?:local\s+)?[A-Za-z_]\w*=)|&&\s*(?:source\b|\.\s))/.test(line))return line;
      for(const resource of resources){
        const path=escape(resource.sourcePath!);
        const ref=new RegExp(String.raw`(?<![A-Za-z0-9_./-])(["']?)(?:(?:\$\{[A-Za-z_]\w*\}|\$[A-Za-z_]\w*)/)?${path}\1(?=[\s;]|$)`,'g');
        line=line.replace(ref,()=>{rewrites++;return '"${C2C_RESOURCE_ROOT}"/'+shellLiteral(resource.path);});
      }
      return line;
    }).join('\n');
    if(unresolved){
      report.unresolvedPaths.push(file.path);
      findings.push({code:'source-script-location',severity:'blocking',file:file.path,message:'Helper com seleção de raiz não reconhecida; requer revisão semântica antes de executar: '+file.sourcePath});
      continue;
    }
    const split=body.indexOf('\n');
    const adapted=body.startsWith('#!')?body.slice(0,split+1)+guard+body.slice(split+1):guard+body;
    put(file.path,adapted,file.sourcePath,true);
    report.adaptedPaths.push(file.path);report.resourceRewrites+=rewrites;
  }
  return report;
}
