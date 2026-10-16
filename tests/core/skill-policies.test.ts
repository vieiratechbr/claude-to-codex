import {expect,it} from 'vitest';
import {parse} from 'yaml';
import {convertComponents} from '../../src/core/conversion';
import {inventorySource,markdownMetadata} from '../../src/core/inventory';
import {activeSkillDetails} from '../../src/core/skill-calls';
import type {SourceSnapshot} from '../../src/shared/contracts';
const options={dataRoot:'unused',useCodex:false,diagnostics:{authenticated:false,capabilities:{exec:false,pluginAdd:true,pluginListJson:true,marketplaceAdd:true,isolatedConversion:false},findings:[]}};
function source(fields:string,extra:Record<string,string>={}):SourceSnapshot{
  return{id:'policies',request:{url:'https://github.com/acme/policies'},commit:'a'.repeat(40),warnings:[],files:Object.entries({'SKILL.md':'---\nname: advice\ndescription: Portable advice\n'+fields+'\n---\nGive portable advice.',...extra}).map(([path,text])=>({path,data:Buffer.from(text),mode:'100644',oid:''}))};
}
async function convert(snapshot:SourceSnapshot){return(await convertComponents(snapshot,inventorySource(snapshot).map(c=>c.id),options))[0];}
it('adapta preferências de modelo e aprovações de ferramentas sem conceder permissões',async()=>{
  const bundle=await convert(source('user-invocable: true\nmodel: sonnet\nallowed-tools: Read, Write, Bash(git status *)'));
  expect(bundle.installable,JSON.stringify(bundle.findings)).toBe(true);
  expect(bundle.findings.filter(f=>f.severity==='warning').map(f=>f.code)).toEqual(expect.arrayContaining(['source-model','source-tool-approval']));
  const skill=bundle.files.find(f=>f.path==='skills/advice/SKILL.md')!;
  const meta=markdownMetadata(skill.data.toString());
  expect(meta['allowed-tools']).toBeUndefined();expect(meta.model).toBeUndefined();
  expect(meta.metadata).toMatchObject({'claude-to-codex':{model:'sonnet','allowed-tools':'Read, Write, Bash(git status *)'}});
  expect(bundle.files.some(f=>/config\.toml|settings\.json$/.test(f.path))).toBe(false);
});
it('converte chamada manual para a política nativa sem apagar os metadados existentes',async()=>{
  const bundle=await convert(source('user-invocable: true\ndisable-model-invocation: true',{'agents/openai.yaml':'interface:\n  display_name: Advice\npolicy:\n  allow_implicit_invocation: true\n'}));
  expect(bundle.installable,JSON.stringify(bundle.findings)).toBe(true);
  const yaml=bundle.files.find(f=>f.path==='skills/advice/agents/openai.yaml')!;
  expect(parse(yaml.data.toString())).toMatchObject({interface:{display_name:'Advice'},policy:{allow_implicit_invocation:false}});
  expect(activeSkillDetails(bundle.files).find(skill=>skill.name==='advice')?.manualOnly).toBe(true);
});
it.each(['user-invocable: false','allowed-tools: 123','model: [sonnet]','disable-model-invocation: "maybe"','disallowed-tools: Write','context: fork','hooks: {}'])('mantém bloqueado o requisito sem adaptação válida: %s',async fields=>{
  const bundle=await convert(source(fields));expect(bundle.installable).toBe(false);
});
it('não sobrescreve metadados nativos malformados para liberar chamada manual',async()=>{
  const bundle=await convert(source('disable-model-invocation: true',{'agents/openai.yaml':'policy: [broken]'}));
  expect(bundle.installable).toBe(false);
});
