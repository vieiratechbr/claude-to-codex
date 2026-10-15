import {markdownMetadata} from './inventory';
import type {BundleFile} from '../shared/contracts';
export function activeSkillDetails(files:readonly Pick<BundleFile,'path'|'data'>[]):{name:string;description:string;path:string}[]{
  const result:{name:string;description:string;path:string}[]=[];
  for(const file of files){
    if(!/^skills\/[^/]+\/SKILL\.md$/.test(file.path)||file.data.length>2*1024*1024||file.data.includes(0))continue;
    try{const meta=markdownMetadata(file.data.toString());if(typeof meta.name!=='string'||! /^[a-z0-9][a-z0-9-]{0,63}$/.test(meta.name))continue;
      result.push({name:meta.name,description:typeof meta.description==='string'?meta.description:'',path:file.path});
    }catch{}
  }
  return result;
}
export function skillCalls(files:readonly Pick<BundleFile,'path'|'data'>[],entrySkill?:string):string[]{
  const names=[...new Set(activeSkillDetails(files).map(skill=>skill.name))];
  if(entrySkill&&names.includes(entrySkill)){names.splice(names.indexOf(entrySkill),1);names.unshift(entrySkill);}
  return names.map(name=>'$'+name);
}
