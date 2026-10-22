import {posix} from 'node:path';
import type {BundleFile,Finding,SourceFile,SourceSnapshot} from '../shared/contracts';
import {safeRelativePath} from './paths';
import {parse} from 'yaml';
function markdownOutsideFences(text:string):string{
  let fence:{marker:string;length:number}|undefined;
  return text.split(/(?<=\n)/).map(line=>{
    const match=/^[ \t]{0,3}(`{3,}|~{3,})([^\r\n]*)/.exec(line);
    if(fence){
      if(match&&match[1][0]===fence.marker&&match[1].length>=fence.length&&!match[2].trim())fence=undefined;
      return line.replace(/[^\r\n]/g,' ');
    }
    if(match&&!(match[1][0]==='`'&&match[2].includes('`'))){
      fence={marker:match[1][0],length:match[1].length};
      return line.replace(/[^\r\n]/g,' ');
    }
    return line;
  }).join('');
}
function scriptSiblingPaths(text:string,path:string):string[]{
  // Recognize a literal resource-directory anchor without evaluating shell
  // code. Its file references must be present before script portability can
  // prove the installed sibling/resource layout. Unknown anchors stay blocked.
  const self=String.raw`\$\(\s*dirname[ \t]+"(?:\$0|\$\{BASH_SOURCE\[0\]\})"[ \t]*\)`;
  const declaration=new RegExp(String.raw`^[ \t]*(?:local[ \t]+)?([A-Za-z_]\w*)="\$\(cd[ \t]+"${self}"(?:[ \t]+2>/dev/null)?[ \t]+&&[ \t]+pwd(?:[ \t]+-[A-Za-z]+)?\)"[ \t]*$`,'gm');
  const code=text.split('\n').filter(line=>!/^\s*#/.test(line)).join('\n'),paths=new Set<string>();
  for(const anchor of code.matchAll(declaration)){
    const reference=new RegExp(String.raw`(?:\$\{${anchor[1]}\}|\$${anchor[1]}(?![A-Za-z0-9_]))/([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)(?=["'\s;)]|$)`,'g');
    for(const resource of code.matchAll(reference))paths.add(posix.normalize(posix.join(posix.dirname(path),resource[1])));
  }
  return [...paths];
}
export function preserveSourceContext(snapshot:SourceSnapshot,files:Map<string,BundleFile>,put:(path:string,data:string|Buffer,sourcePath?:string,replace?:boolean)=>void,findings:Finding[]):void{
  const source=new Map(snapshot.files.map(file=>[file.path,file]));
  const agents=snapshot.files.filter(file=>/(^|\/)\.(?:claude|agents)\/agents\/[^/]+\.md$/.test(file.path));
  const pluginRoots=snapshot.files.filter(file=>/(^|\/)\.claude-plugin\/plugin\.json$/.test(file.path)).map(file=>file.path.replace(/\.claude-plugin\/plugin\.json$/,'')).sort((a,b)=>b.length-a.length);
  for(const skill of [...files.values()].filter(file=>/^skills\/[^/]+\/SKILL\.md$/.test(file.path)&&file.sourcePath)){
    const initial=source.get(skill.sourcePath!);if(!initial)continue;
    const prefix=pluginRoots.find(root=>initial.path.startsWith(root))??/^(.*?)(?:\.claude|\.agents)\//.exec(initial.path)?.[1]??'';
    const support=[...files.values()].filter(file=>file.path.startsWith(posix.dirname(skill.path)+'/')&&file.path.endsWith('.md')&&!file.path.includes('/assets/')&&file.sourcePath&&file.path!==skill.path).flatMap(file=>source.get(file.sourcePath!)||[]);
    const direct=new Set([initial.path,...support.map(file=>file.path)]);
    const queue:SourceFile[]=[initial,...support],seen=new Set<string>(),mapped=new Map<string,string>(),catalogAliases:{catalog:string;value:string;source:string}[]=[];let limited=false;
    const add=(path:string,required=false)=>{
      try{
        safeRelativePath(path);const original=source.get(path);
        if(/(^|\/)SKILL\.md$/.test(path)&&![...files.values()].some(file=>file.sourcePath===path)){
          findings.push({code:'unselected-source-skill',severity:'blocking',file:skill.path,message:'A dependência ativa exige selecionar a skill: '+path});return;
        }
        if(!original){
          const message='Dependência da origem não incluída neste snapshot: '+path+'. Confira o projeto e os requisitos antes de usar a skill.';
          const existing=findings.find(f=>f.code==='source-context-missing'&&f.file===skill.path&&f.message===message);
          if(existing){if(required)existing.severity='blocking';}else findings.push({code:'source-context-missing',severity:required?'blocking':'warning',file:skill.path,message});
          return;
        }
        if(original.mode==='160000'||original.data.toString('utf8',0,100).startsWith('version https://git-lfs.github.com/spec/v1')){
          findings.push({code:'external-resource',severity:'blocking',file:skill.path,message:'Dependência externa não baixada: '+path});return;
        }
        if(mapped.has(path))return;
        if(mapped.size>=1024){limited=true;return;}
        const destination=[...files.values()].find(file=>file.sourcePath===path)?.path||'source-context/'+path;
        if(!files.has(destination))put(destination,original.data,path);
        const body=original.data.toString();
        if(/\.(?:sh|bash)$/.test(path)&&/dirname[^\n]*(?:BASH_SOURCE|\$0)/.test(body)&&/(?:\bcd[ \t]+|\b[A-Z_]*ROOT\s*=)/.test(body)){
          const message='O helper '+path+' deriva a raiz do projeto da própria localização. A cópia instalada exige adaptação explícita antes de executar; alterar só o diretório de trabalho não preserva sua função.';
          if(!findings.some(f=>f.code==='source-script-location'&&f.file===skill.path&&f.message===message))findings.push({code:'source-script-location',severity:'blocking',file:skill.path,message});
        }
        mapped.set(path,destination);queue.push(original);
      }catch(error){findings.push({code:'invalid-source-context',severity:'blocking',file:skill.path,message:(error as Error).message});}
    };
    for(let index=0;index<queue.length;index++){
      const file=queue[index];if(seen.has(file.path)||file.data.includes(0))continue;seen.add(file.path);
      const text=file.data.toString();
      if(/\.(?:sh|bash)$/.test(file.path))for(const path of scriptSiblingPaths(text,file.path))add(path,true);
      // A referenced test catalog owns its concrete specification resources.
      // Read data only: no embedded programs, tags or tests are executed.
      if(/(?:^|\/)catalog\.ya?ml$/i.test(file.path)){
        try{
          const catalog=parse(text,{maxAliasCount:20});
          for(const collection of [catalog?.skills,catalog?.agents])if(Array.isArray(collection))for(const entry of collection){
            if(!entry||typeof entry!=='object'||typeof entry.name!=='string'||entry.spec===undefined||entry.spec==='')continue;
            if(typeof entry.spec!=='string')throw new Error('Caminho spec inválido no catálogo: '+file.path);
            const raw=safeRelativePath(entry.spec),candidates=[prefix+raw,posix.normalize(posix.join(posix.dirname(file.path),raw)),raw];
            const resolved=candidates.find(path=>source.has(path))||prefix+raw;
            add(resolved,true);
            if(resolved!==raw&&!catalogAliases.some(alias=>alias.catalog===file.path&&alias.value===raw))catalogAliases.push({catalog:file.path,value:raw,source:resolved});
          }
        }catch(error){findings.push({code:'invalid-source-context',severity:'blocking',file:skill.path,message:(error as Error).message});}
      }
      const requiredAt=(index:number)=>{
        const line=text.slice(text.lastIndexOf('\n',index)+1,text.indexOf('\n',index)<0?text.length:text.indexOf('\n',index));
        if(/\b(?:optional|example|illustrat\w*)\b/i.test(line))return false;
        if(/\b(?:must|required|mandatory)\b|do not .{0,50}without/i.test(line))return true;
        const nextBlank=text.indexOf('\n\n',index),paragraph=text.slice(index,nextBlank<0?Math.min(text.length,index+1200):Math.min(nextBlank,index+1200));
        if(/\b(?:Glob|detect|check|look for|find)\b/i.test(line)&&/\bif\b[^\n]{0,80}\b(?:found|exists|available)\b/i.test(paragraph))return false;
        return direct.has(file.path)||/\b(?:before|read|consult)\b/i.test(line);
      };
      for(const match of /\.(?:md|markdown)$/i.test(file.path)?markdownOutsideFences(text).matchAll(/\[[^\]\n]*\]\((<[^>\n]+>|[^\s)]+)(?:\s+[^)]*)?\)/g):[]){
        const raw=match[1].replace(/^<|>$/g,'').split(/[?#]/)[0];if(!raw||/^(?:[a-z]+:|\/)/i.test(raw)||/[*{}]/.test(raw))continue;
        try{add(posix.normalize(posix.join(posix.dirname(file.path),decodeURIComponent(raw))),requiredAt(match.index!));}catch(error){findings.push({code:'invalid-source-context',severity:'blocking',file:skill.path,message:(error as Error).message});}
      }
      for(const match of text.matchAll(/`([^`\n]+)`/g)){
        const raw=match[1].replace(/[?#].*$/,'');if(!/\.[a-zA-Z0-9]+$/.test(raw)||/[${}*?<>]|^[a-z]+:|^\//i.test(raw))continue;
        const candidates=[prefix+raw,posix.normalize(posix.join(posix.dirname(file.path),raw)),raw];
        const path=candidates.find(path=>source.has(path));if(path)add(path,requiredAt(match.index!));
      }
      for(const match of text.matchAll(/\$\{CLAUDE_SKILL_DIR\}\/([^\s"`<>]+)/g)){
        if(!/^[a-zA-Z0-9_./-]+$/.test(match[1]))continue;
        const path=posix.normalize(posix.join(posix.dirname(initial.path),match[1]));
        if(path==='.'||snapshot.files.some(file=>file.path.startsWith(path+'/')))continue;
        add(path,requiredAt(match.index!));
      }
      for(const match of text.matchAll(/\.(?:claude|agents)\/(?:docs|agents|scripts|hooks)\/[a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+\b/g)){
        const path=prefix&&source.has(prefix+match[0])?prefix+match[0]:match[0];add(path,requiredAt(match.index!));
      }
      for(const match of text.matchAll(/\.(?:claude|agents)\/(?:docs|agents)\/(?:[a-zA-Z0-9_-]+\/)*?(?=[`\s<])/g)){
        const directory=prefix&&snapshot.files.some(f=>f.path.startsWith(prefix+match[0]))?prefix+match[0]:match[0];
        for(const candidate of snapshot.files.filter(f=>f.path.startsWith(directory)&&/\.(?:md|ya?ml)$/.test(f.path)))add(candidate.path);
      }
      const roleNames=new Set(agents.map(agent=>posix.basename(agent.path,'.md')));
      for(const name of roleNames){
        const literal=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
        if(!new RegExp('(?<![a-zA-Z0-9_-])'+literal+'(?![a-zA-Z0-9_-])').test(text))continue;
        const paths=[prefix+'.claude/agents/'+name+'.md',prefix+'.agents/agents/'+name+'.md','.claude/agents/'+name+'.md','.agents/agents/'+name+'.md'];
        const path=paths.find(path=>source.has(path));if(path)add(path);
      }
    }
    if(limited)findings.push({code:'source-context-limit',severity:'blocking',file:skill.path,message:'O limite de 1024 dependências compartilhadas foi atingido. Separe ou revise a skill.'});
    if(!mapped.size)continue;
    const guide=posix.dirname(skill.path)+'/references/source-context-map.md';
    if(files.has(guide)){findings.push({code:'source-context-collision',severity:'blocking',file:skill.path,message:'A origem já usa o caminho reservado ao mapa de recursos: '+guide});continue;}
    const text=['# Recursos compartilhados da origem','','Documentos e scripts abaixo são recursos de apoio; as adaptações de compatibilidade aparecem na revisão da conversão. Não registram agentes, não ativam hooks e não concedem permissões. Resolva os links a partir deste documento instalado. Valores spec dos catálogos YAML preservados são caminhos da origem: procure o valor exato nesta tabela e leia o recurso instalado correspondente a partir da raiz do pacote, nunca do projeto ou do diretório do catálogo. Catálogos instalados são baselines somente leitura; resultados e atualizações exigem uma cópia de trabalho aprovada no projeto, com leituras posteriores vinculadas à mesma cópia.','','Arquivos de trabalho como project.yaml, project.local.yaml, .claude/docs/technical-preferences.md, design/, assets/ e production/ pertencem ao projeto em uso. Sua cópia da origem serve somente como modelo, nunca como os valores atuais do projeto. Não substitua a configuração do usuário pelo pacote. Ao usar um script auxiliar, confira o diretório de trabalho exigido, as dependências e as permissões da sessão. Definições de especialistas não comprovam disponibilidade de delegação ou isolamento; verifique esses recursos antes de etapas que os exigem.','','| Caminho na origem | Recurso instalado |','| --- | --- |',...[...mapped].map(([original,destination])=>'| `'+original+'` | [abrir'+(original.endsWith('/technical-preferences.md')?' modelo de configuração do projeto':'')+']('+posix.relative(posix.dirname(guide),destination).split('/').map(encodeURIComponent).join('/')+') |')].join('\n')+'\n';
    put(guide,text);
    const aliases=catalogAliases.filter(alias=>mapped.has(alias.source));
    if(aliases.length)put(guide,text+'\n## Valores relativos de especificações\n\nPara cada par catálogo e valor spec abaixo, use o destino explícito desta tabela. O valor relativo não é um caminho do projeto.\n\n| Catálogo da origem | Valor spec | Recurso instalado |\n| --- | --- | --- |\n'+aliases.map(alias=>'| `'+alias.catalog+'` | `'+alias.value+'` | [abrir]('+posix.relative(posix.dirname(guide),mapped.get(alias.source)!).split('/').map(encodeURIComponent).join('/')+') |').join('\n')+'\n',undefined,true);
    put(skill.path,skill.data.toString()+'\n\n## Recursos da origem\n\nConsulte [o mapa de recursos compartilhados](references/source-context-map.md) antes de resolver caminhos de infraestrutura, scripts auxiliares ou especialistas citados neste workflow.\n',skill.sourcePath,true);
  }
}
