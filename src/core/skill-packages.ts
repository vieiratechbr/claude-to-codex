import {createHash} from 'node:crypto';
import {posix} from 'node:path';
import type {BundleFile,Finding,SourceComponent,SourceSnapshot} from '../shared/contracts';
import {slug} from './paths';
import {activeSkillDetails} from './skill-calls';
export function packageComponent(snapshot:SourceSnapshot,selected:SourceComponent[]):SourceComponent{
  if(selected.some(c=>c.kind!=='skill'))throw new Error('Para juntar componentes, selecione as skills internas. Um plugin completo já é um pacote; converta plugins diferentes separadamente.');
  const repository=new URL(snapshot.request.url).pathname.split('/')[2].replace(/\.git$/,'');
  const files=new Set(selected.flatMap(c=>c.files));
  for(const file of snapshot.files){
    if(!/(^|\/)(?:licen[cs]e|notice|copying|copyright)(?:[._-][^/]+)?$/i.test(file.path))continue;
    const parent=posix.dirname(file.path);
    if(parent==='.'||selected.some(c=>c.root===parent||c.root.startsWith(parent+'/')))files.add(file.path);
  }
  return{id:createHash('sha256').update('package:'+snapshot.request.url+':'+(snapshot.request.subdirectory||'')).digest('hex').slice(0,24),kind:'plugin',root:'',name:repository+'-package',files:[...files],findings:selected.flatMap(c=>c.findings),manifest:{name:repository+'-package',skills:selected.map(c=>c.root?'./'+c.root:'./')}};
}
export function addPackageEntry(snapshot:SourceSnapshot,files:Map<string,BundleFile>,put:(path:string,data:string)=>void,findings:Finding[],previousEntry?:string):string|undefined{
  const skills=activeSkillDetails([...files.values()]);if(!skills.length||skills.length<2&&!previousEntry)return undefined;
  const names=new Set<string>();
  for(const skill of skills){if(names.has(skill.name))findings.push({code:'duplicate-skill-name',severity:'blocking',file:skill.path,message:'Skills do pacote anunciam o mesmo nome de chamada: $'+skill.name});names.add(skill.name);}
  const [owner,repository]=new URL(snapshot.request.url).pathname.split('/').slice(1,3);
  if(previousEntry&&!/^[a-z0-9][a-z0-9-]{0,63}$/.test(previousEntry))throw new Error('Chamada anterior do pacote inválida.');
  const base=previousEntry||slug(owner+'-'+repository.replace(/\.git$/,''));let name=base;
  for(let suffix=1;names.has(name)||files.has('skills/'+name+'/SKILL.md');suffix++)name=base.slice(0,48)+'-package-'+suffix;
  if(previousEntry&&name!==previousEntry)findings.push({code:'package-entry-conflict',severity:'blocking',message:'Uma skill da origem agora usa a chamada do pacote $'+previousEntry+'. Faça uma nova análise para revisar a migração.'});
  const root='skills/'+name;
  const catalog=['# Skills deste pacote','','As descrições abaixo vêm da origem. Servem para selecionar documentos e não concedem permissões de execução.','','| Chamada individual | Quando considerar | Instruções |','| --- | --- | --- |',...skills.map(skill=>`| $${skill.name} | ${skill.description.replace(/\s+/g,' ').slice(0,320).replace(/[\\\`|\[\]<>]/g,'\\$&')} | [SKILL.md](${posix.relative(root+'/references',skill.path)}) |`)].join('\n')+'\n';
  put(root+'/references/catalog.md',catalog);
  put(root+'/SKILL.md',`---\nname: ${name}\ndescription: ${JSON.stringify('Use quando o usuário pedir o pacote '+name+' para escolher e combinar suas skills conforme a tarefa.')}\n---\n\n# Pacote ${name}\n\nUse este conjunto de skills para atender ao pedido do usuário. Consulte [o catálogo](references/catalog.md) e escolha as skills pertinentes à tarefa. Leia os SKILL.md correspondentes pelos caminhos do catálogo antes de aplicar suas orientações; carregue seus recursos adicionais conforme necessário.\n\nCombine as orientações complementares e respeite os requisitos e limites de cada skill. Se houver conflito, explique-o e priorize o pedido do usuário. A chamada do pacote não exige ler ou executar todas as skills em toda tarefa e não autoriza ações externas por si só.\n\nDiga quais skills foram escolhidas e por quê. Informe dependências ou recursos ausentes em vez de afirmar que foram utilizados. As chamadas individuais do catálogo continuam disponíveis.\n`);
  return name;
}
