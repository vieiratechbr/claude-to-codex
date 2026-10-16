import {parse,stringify} from 'yaml';
import type {BundleFile,Finding} from '../shared/contracts';
function object(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
export function applyManualInvocationPolicy(paths:Iterable<string>,files:Map<string,BundleFile>,put:(path:string,data:string,sourcePath?:string,replace?:boolean)=>void,findings:Finding[]):void{
  for(const path of paths){
    const target=path.replace(/SKILL\.md$/,'agents/openai.yaml'),existing=files.get(target);
    try{
      const data:unknown=existing?parse(existing.data.toString(),{maxAliasCount:20}):{};
      if(!object(data)||data.policy!==undefined&&!object(data.policy))throw new Error('Metadados de política nativa inválidos.');
      data.policy={...(data.policy as Record<string,unknown>|undefined),allow_implicit_invocation:false};
      put(target,stringify(data),existing?.sourcePath,true);
    }catch(error){findings.push({code:'native-skill-policy',severity:'blocking',file:path,message:(error as Error).message});}
  }
}
