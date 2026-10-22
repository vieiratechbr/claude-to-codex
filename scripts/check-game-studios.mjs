// Opt-in, pinned repository QA. Does not install plugins or execute imported code.
import {build} from 'esbuild';
import {mkdir,mkdtemp,readFile,writeFile,realpath} from 'node:fs/promises';
import {join,resolve,posix,relative,isAbsolute,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {homedir} from 'node:os';
import {parse} from 'yaml';

const url='https://github.com/Donchitos/Claude-Code-Game-Studios';
const args=process.argv.slice(2),assist=args.includes('--assist');
const revisionIndex=args.indexOf('--revision');
const commit=revisionIndex<0?'be8993bbc5a1f016bc770b2846ce06272d284526':args[revisionIndex+1];
if(!/^[a-f0-9]{40}$/.test(commit||''))throw Error('Revision requires an exact 40-character Git commit.');
function argument(name){const i=args.indexOf(name);if(i<0)return undefined;if(!args[i+1]||args[i+1].startsWith('--'))throw Error('Missing '+name+' path.');return resolve(args[i+1]);}
const snapshotPath=argument('--snapshot'),bundlePath=argument('--bundle');
await mkdir('.cache',{recursive:true});
const resume=argument('--resume');let root;
if(resume){
 root=await realpath(resume);const rel=relative(await realpath('.cache'),root);
 if(!rel||rel.startsWith('..')||isAbsolute(rel)||!/^game-studios-qa-[A-Za-z0-9_-]+$/.test(basename(root)))throw Error('Resume requires a previous QA directory inside this workspace cache.');
 const previous=JSON.parse(await readFile(join(root,'snapshot.json'),'utf8'));if(previous.commit!==commit)throw Error('Resume snapshot revision mismatch.');
}else root=await mkdtemp(join(process.cwd(),'.cache/game-studios-qa-'));
console.log(JSON.stringify({root,sourceCommit:commit,assisted:assist}));
await build({stdin:{contents:"export {acquireSource} from './src/core/source';export {findExecutable,diagnoseCodex} from './src/core/codex';export {inventorySource,markdownMetadata} from './src/core/inventory';export {convertComponents,validateBundle} from './src/core/conversion';export {activeSkillDetails} from './src/core/skill-calls';",resolveDir:process.cwd()},outfile:join(root,'core.mjs'),bundle:true,platform:'node',format:'esm',packages:'external'});
const core=await import(pathToFileURL(join(root,'core.mjs')).href);
const digest=data=>createHash('sha256').update(data).digest('hex');
const personal=join(process.env.CODEX_HOME||join(homedir(),'.codex'),'config.toml');
async function fingerprint(){try{return digest(await readFile(personal));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
const before=await fingerprint(),report={root,sourceCommit:commit,assisted:assist};
const decode=raw=>({...raw,files:raw.files.map(file=>({...file,data:Buffer.from(file.data,'base64')}))});
const encode=value=>({...value,files:value.files.map(file=>({...file,data:file.data.toString('base64')}))});
try{
 let snapshot;
 if(snapshotPath)snapshot=decode(JSON.parse(await readFile(snapshotPath,'utf8')));
 else{
  const gitPath=await core.findExecutable('git');if(!gitPath)throw Error('Git runtime not found.');
  snapshot=await core.acquireSource({url,ref:commit},{dataRoot:root,gitPath,onProgress:p=>console.log(p.message)});
 }
 if(snapshot.commit!==commit)throw Error('Unexpected source revision.');
 await writeFile(join(root,'snapshot.json'),JSON.stringify(encode(snapshot)));
 const selected=core.inventorySource(snapshot).filter(c=>c.kind==='skill');
 if(selected.length!==74)throw Error('Expected all 74 pinned source skills.');
 let bundle;
 if(bundlePath)bundle=decode(JSON.parse(await readFile(bundlePath,'utf8')));
 else{
  const diagnostics=assist?await core.diagnoseCodex():{authenticated:false,capabilities:{exec:false,pluginAdd:false,pluginListJson:false,marketplaceAdd:false,isolatedConversion:false},findings:[]};
  [bundle]=await core.convertComponents(snapshot,selected.map(c=>c.id),{dataRoot:root,diagnostics,useCodex:assist,asPackage:true,onProgress:p=>console.log(p.message)});
 }
 if(bundle.sourceCommit!==commit)throw Error('Bundle revision does not match the pinned source.');
 await writeFile(join(root,'bundle.json'),JSON.stringify(encode(bundle)));
 const files=new Map(bundle.files.map(file=>[file.path,file])),calls=core.activeSkillDetails(bundle.files);
 const expected=selected.map(s=>s.name),names=calls.map(s=>s.name);
 const expectedManual=selected.filter(skill=>core.markdownMetadata(snapshot.files.find(f=>f.path===skill.root+'/SKILL.md').data.toString())['disable-model-invocation']===true).map(s=>s.name).sort();
 const manual=calls.filter(s=>s.manualOnly).map(s=>s.name).sort();
 const missing=expected.filter(name=>!names.includes(name));
 const duplicateNames=names.filter((name,i)=>names.indexOf(name)!==i);
 const scripts=JSON.parse(files.get('codex-compat/scripts.json')?.data.toString()||'{}');
 const scriptHashFailures=Object.entries(scripts).filter(([path,sha])=>!files.has(path)||digest(files.get(path).data)!==sha).map(([path])=>path);
 const specialists=JSON.parse(files.get('codex-compat/specialist-bindings.json')?.data.toString()||'{"roles":[],"generatedFiles":{}}');
 const bindingHashFailures=Object.entries(specialists.generatedFiles).filter(([path,sha])=>!files.has(path)||digest(files.get(path).data)!==sha).map(([path])=>path);
 const preloadFailures=specialists.roles.flatMap(role=>role.preloads.filter(preload=>!calls.some(call=>'$'+call.name===preload.nativeCall&&call.path===preload.resourcePath&&call.manualOnly===preload.manualOnly)||!files.has(preload.resourcePath)||digest(files.get(preload.resourcePath).data)!==preload.sha256).map(preload=>({role:role.sourceName,preload:preload.sourceName})));
 const sourceCatalogs=snapshot.files.filter(file=>/(?:^|\/)catalog\.ya?ml$/.test(file.path)).filter(file=>{try{const value=parse(file.data.toString(),{maxAliasCount:20});return Array.isArray(value?.skills)&&Array.isArray(value?.agents);}catch{return false;}});
 if(sourceCatalogs.length!==1)throw Error('Expected one unambiguous source skill/agent test catalog.');
 const sourceCatalog=sourceCatalogs[0],expectedCatalog=parse(sourceCatalog.data.toString(),{maxAliasCount:20});
 const expectedSpecifications=[...expectedCatalog.skills,...expectedCatalog.agents].filter(entry=>typeof entry.spec==='string'&&entry.spec).length;
 const catalog=bundle.files.find(file=>file.sourcePath===sourceCatalog.path);
 const catalogData=catalog?parse(catalog.data.toString(),{maxAliasCount:20}):{};
 const specifications=[...(catalogData.skills||[]),...(catalogData.agents||[])].filter(entry=>typeof entry.spec==='string'&&entry.spec);
 const missingSpecifications=specifications.filter(entry=>!bundle.files.some(file=>file.sourcePath===entry.spec||file.path===entry.spec)).map(entry=>entry.spec);
 const links=[],pending=calls.map(call=>call.path),visited=new Set();
 for(const path of pending){
  if(visited.has(path))continue;visited.add(path);
  const file=files.get(path);if(!file||!path.endsWith('.md'))continue;
  // Skip fenced examples and inline code; they can contain literal template links.
  let fence;const prose=file.data.toString().split(/\r?\n/).filter(line=>{const m=/^\s*(`{3,}|~{3,})(.*)$/.exec(line);if(m){if(!fence)fence=m[1];else if(m[1][0]===fence[0]&&m[1].length>=fence.length&&!m[2].trim())fence=undefined;return false;}return !fence;}).join('\n').replace(/(`+)[\s\S]*?\1/g,'');
  for(const match of prose.matchAll(/\[[^\]\n]*\]\((<[^>\n]+>|[^\s)]+)(?:\s+[^)]*)?\)/g)){
   const raw=match[1].replace(/^<|>$/g,'');if(/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(raw))continue;
   if(/\/templates?\//.test(path)&&/^(?:link|url|path|placeholder)$/i.test(raw))continue;
   let target;try{target=posix.normalize(posix.join(posix.dirname(path),decodeURIComponent(raw.split(/[?#]/)[0])));}catch{links.push({from:path,raw});continue;}
   if(!files.has(target))links.push({from:path,raw,target});else if(target.endsWith('.md'))pending.push(target);
  }
 }
 Object.assign(report,{installable:bundle.installable,files:bundle.files.length,sourceSkills:expected.length,activeCalls:calls.length,missing,duplicateNames,manual,expectedManual,scriptCount:Object.keys(scripts).length,scriptHashFailures,specialistCount:specialists.roles.length,blockedSpecialists:specialists.roles.filter(role=>role.status==='blocked').map(role=>role.sourceName),bindingHashFailures,preloadFailures,specifications:specifications.length,expectedSpecifications,missingSpecifications,missingLinks:links,blocking:bundle.findings.filter(f=>f.severity==='blocking'),validation:core.validateBundle(bundle)});
 report.passed=report.installable&&calls.length===75&&!missing.length&&!duplicateNames.length&&JSON.stringify(manual)===JSON.stringify(expectedManual)&&!scriptHashFailures.length&&specialists.roles.length===49&&!report.blockedSpecialists.length&&!bindingHashFailures.length&&!preloadFailures.length&&specifications.length===expectedSpecifications&&!missingSpecifications.length&&!links.length&&!report.validation.length&&!report.blocking.length;
}catch(e){report.error=e.message;report.passed=false;}
finally{
 report.personalConfigUnchanged=before===await fingerprint();report.passed=report.passed&&report.personalConfigUnchanged;
 await writeFile(join(root,'report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({root,report:join(root,'report.json'),passed:report.passed,installable:report.installable,activeCalls:report.activeCalls,specialists:report.specialistCount,blocking:report.blocking?.length,missingLinks:report.missingLinks?.length,personalConfigUnchanged:report.personalConfigUnchanged,error:report.error},null,2));
 if(!report.passed)process.exitCode=1;
}
