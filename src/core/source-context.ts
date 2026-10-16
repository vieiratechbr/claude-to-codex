import {posix} from 'node:path';
import type {BundleFile,Finding,SourceFile,SourceSnapshot} from '../shared/contracts';
import {safeRelativePath} from './paths';
export function preserveSourceContext(snapshot:SourceSnapshot,files:Map<string,BundleFile>,put:(path:string,data:string|Buffer,sourcePath?:string,replace?:boolean)=>void,findings:Finding[]):void{
  const source=new Map(snapshot.files.map(file=>[file.path,file]));
  const agents=snapshot.files.filter(file=>/(^|\/)\.(?:claude|agents)\/agents\/[^/]+\.md$/.test(file.path));
  const pluginRoots=snapshot.files.filter(file=>/(^|\/)\.claude-plugin\/plugin\.json$/.test(file.path)).map(file=>file.path.replace(/\.claude-plugin\/plugin\.json$/,'')).sort((a,b)=>b.length-a.length);
  for(const skill of [...files.values()].filter(file=>/^skills\/[^/]+\/SKILL\.md$/.test(file.path)&&file.sourcePath)){
    const initial=source.get(skill.sourcePath!);if(!initial)continue;
    const prefix=pluginRoots.find(root=>initial.path.startsWith(root))??/^(.*?)(?:\.claude|\.agents)\//.exec(initial.path)?.[1]??'';
    const support=[...files.values()].filter(file=>file.path.startsWith(posix.dirname(skill.path)+'/')&&file.path.endsWith('.md')&&!file.path.includes('/assets/')&&file.sourcePath&&file.path!==skill.path).flatMap(file=>source.get(file.sourcePath!)||[]);
    const direct=new Set([initial.path,...support.map(file=>file.path)]);
    const queue:SourceFile[]=[initial,...support],seen=new Set<string>(),mapped=new Map<string,string>();let limited=false;
    const add=(path:string,required=false)=>{
      try{
        safeRelativePath(path);const original=source.get(path);
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
      const requiredAt=(index:number)=>{
        if(direct.has(file.path))return true;
        const line=text.slice(text.lastIndexOf('\n',index)+1,text.indexOf('\n',index)<0?text.length:text.indexOf('\n',index));
        return !/\b(?:optional|example|illustrat\w*)\b/i.test(line)&&/\b(?:must|required|mandatory|before|read|consult)\b|do not .{0,50}without/i.test(line);
      };
      for(const match of text.matchAll(/\$\{CLAUDE_SKILL_DIR\}\/([^\s"`<>]+)/g)){
        if(/[\[\]{}…*?]/.test(match[1]))continue;
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
        if(!text.includes('`'+name+'`'))continue;
        const paths=[prefix+'.claude/agents/'+name+'.md',prefix+'.agents/agents/'+name+'.md','.claude/agents/'+name+'.md','.agents/agents/'+name+'.md'];
        const path=paths.find(path=>source.has(path));if(path)add(path);
      }
    }
    if(limited)findings.push({code:'source-context-limit',severity:'blocking',file:skill.path,message:'O limite de 1024 dependências compartilhadas foi atingido. Separe ou revise a skill.'});
    if(!mapped.size)continue;
    const guide=posix.dirname(skill.path)+'/references/source-context-map.md';
    if(files.has(guide)){findings.push({code:'source-context-collision',severity:'blocking',file:skill.path,message:'A origem já usa o caminho reservado ao mapa de recursos: '+guide});continue;}
    const text=['# Recursos compartilhados da origem','','Documentos e scripts abaixo são recursos inativos preservados por conteúdo. Não registram agentes, não ativam hooks e não concedem permissões. Resolva os links a partir deste documento instalado.','','Arquivos de trabalho como project.yaml, project.local.yaml, .claude/docs/technical-preferences.md, design/, assets/ e production/ pertencem ao projeto em uso. Sua cópia da origem serve somente como modelo, nunca como os valores atuais do projeto. Não substitua a configuração do usuário pelo pacote. Ao usar um script auxiliar, confira o diretório de trabalho exigido, as dependências e as permissões da sessão. Definições de especialistas não comprovam disponibilidade de delegação ou isolamento; verifique esses recursos antes de etapas que os exigem.','','| Caminho na origem | Recurso instalado |','| --- | --- |',...[...mapped].map(([original,destination])=>'| `'+original+'` | [abrir'+(original.endsWith('/technical-preferences.md')?' modelo de configuração do projeto':'')+']('+posix.relative(posix.dirname(guide),destination)+') |')].join('\n')+'\n';
    put(guide,text);
    put(skill.path,skill.data.toString()+'\n\n## Recursos da origem\n\nConsulte [o mapa de recursos compartilhados](references/source-context-map.md) antes de resolver caminhos de infraestrutura, scripts auxiliares ou especialistas citados neste workflow.\n',skill.sourcePath,true);
  }
}
