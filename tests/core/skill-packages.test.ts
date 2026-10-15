import {expect,it} from 'vitest';
import {convertComponents} from '../../src/core/conversion';
import {inventorySource} from '../../src/core/inventory';
import {AppService} from '../../src/main/service';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {SourceSnapshot,Diagnostics} from '../../src/shared/contracts';
import {loadBundle,saveBundle} from '../../src/core/installer';
const diagnostics:Diagnostics={gitPath:'fixture',authenticated:false,capabilities:{exec:false,pluginAdd:true,pluginListJson:true,marketplaceAdd:true,isolatedConversion:false},findings:[]};
const options={dataRoot:'unused',useCodex:false,diagnostics,asPackage:true};
function source(count=2):SourceSnapshot{
  const files=Array.from({length:count},(_,i)=>({path:`skills/item-${i}/SKILL.md`,data:Buffer.from(`---\nname: call-${i}\ndescription: Fixture ${i}\n---\n${i===0&&count>1?'Read [the companion](../item-1/SKILL.md).':'Portable advice.'}`),mode:'100644',oid:''}));
  files.push({path:'LICENSE',data:Buffer.from('preserve original license'),mode:'100644',oid:''});
  return{id:'fixture',request:{url:'https://github.com/acme/collection.git'},commit:'a'.repeat(40),warnings:[],files};
}
it('reúne 74 skills com referência cruzada em uma instalação e uma chamada de pacote',async()=>{
  const snapshot=source(74),ids=inventorySource(snapshot).map(c=>c.id);
  const bundles=await convertComponents(snapshot,ids,options);
  expect(bundles).toHaveLength(1);const bundle=bundles[0];
  expect(bundle.installable,JSON.stringify(bundle.findings)).toBe(true);
  expect(bundle.componentIds).toEqual(ids);expect(bundle.groupAll).toBe(true);
  expect(bundle.entrySkill).toBe('acme-collection');
  expect(bundle.files.filter(f=>/^skills\/[^/]+\/SKILL.md$/.test(f.path))).toHaveLength(75);
  expect(bundle.files.find(f=>f.path==='LICENSE')?.data.toString()).toBe('preserve original license');
  expect(bundle.files.find(f=>f.path==='skills/item-0/SKILL.md')?.data.toString()).toContain('../item-1/SKILL.md');
  const index=bundle.files.find(f=>f.path==='skills/acme-collection/references/catalog.md')!.data.toString();
  expect(index).toContain('call-0');expect(index).toContain('call-73');expect(index).toContain('../../item-73/SKILL.md');
});
it('mantém importação individual e identidade estável do pacote entre subconjuntos',async()=>{
  const snapshot=source(3),ids=inventorySource(snapshot).map(c=>c.id);
  const [all]=await convertComponents(snapshot,ids,options);
  const [subset]=await convertComponents(snapshot,ids.slice(0,2),options);
  expect(subset.pluginName).toBe(all.pluginName);expect(subset.groupAll).toBe(false);
  const individual=await convertComponents(snapshot,ids,{...options,asPackage:false});
  expect(individual).toHaveLength(3);expect(individual.every(b=>!b.entrySkill)).toBe(true);
});
it('a chamada de pacote preserva os impedimentos do plugin completo',async()=>{
  const snapshot=source();snapshot.files.push({path:'.claude-plugin/plugin.json',data:Buffer.from('{"name":"collection","hooks":{"Stop":[]}}'),mode:'100644',oid:''});
  const parent=inventorySource(snapshot).find(c=>c.kind==='plugin')!;
  const [bundle]=await convertComponents(snapshot,[parent.id],options);
  expect(bundle.installable).toBe(false);expect(bundle.findings.some(f=>f.severity==='blocking'&&/hook/i.test(f.message))).toBe(true);
});
it('bloqueia nomes individuais repetidos e evita colisão com a chamada de entrada',async()=>{
  const snapshot=source(2);
  snapshot.files[0].data=Buffer.from('---\nname: acme-collection\ndescription: First\n---\nPortable.');
  snapshot.files[1].data=Buffer.from('---\nname: acme-collection\ndescription: Second\n---\nPortable.');
  const [bundle]=await convertComponents(snapshot,inventorySource(snapshot).map(c=>c.id),options);
  expect(bundle.installable).toBe(false);
  expect(bundle.findings.some(f=>f.code==='duplicate-skill-name'&&f.severity==='blocking')).toBe(true);
  expect(bundle.entrySkill).toBe('acme-collection-package-1');
});
it('preserva skills de plugins diferentes quando as pastas têm o mesmo nome',async()=>{
  const snapshot:SourceSnapshot={id:'nested',request:{url:'https://github.com/acme/collection'},commit:'a'.repeat(40),warnings:[],files:['left','right'].flatMap(side=>[
    {path:`plugins/${side}/.claude-plugin/plugin.json`,mode:'100644',oid:'',data:Buffer.from(JSON.stringify({name:side}))},
    {path:`plugins/${side}/skills/task/SKILL.md`,mode:'100644',oid:'',data:Buffer.from(`---\nname: ${side}-task\ndescription: ${side}\n---\nRead [resource](references/info.md).`)},
    {path:`plugins/${side}/skills/task/references/info.md`,mode:'100644',oid:'',data:Buffer.from(side+' resource')}
  ])};
  const ids=inventorySource(snapshot).filter(c=>c.kind==='skill').map(c=>c.id);
  const [bundle]=await convertComponents(snapshot,ids,options);
  expect(bundle.installable,JSON.stringify(bundle.findings)).toBe(true);
  for(const side of ['left','right']){
    const skill=bundle.files.find(f=>/^skills\/[^/]+\/SKILL.md$/.test(f.path)&&f.data.toString().includes('name: '+side+'-task'))!;
    expect(skill).toBeDefined();
    const resource=skill.path.replace('SKILL.md','references/info.md');
    expect(bundle.files.find(f=>f.path===resource)?.data.toString()).toBe(side+' resource');
  }
});
it('atualiza o conjunto completo com novas skills e preserva a seleção de um subconjunto',async()=>{
  const root=await mkdtemp(join(tmpdir(),'c2c-package-update-'));
  try{
    const before=source(3),after=source(4);after.id='updated-analysis';
    const ids=inventorySource(before).map(c=>c.id);
    const service=new AppService({dataRoot:root,readSource:async()=>after,diagnose:async()=>diagnostics});
    for(const groupAll of [true,false]){
      const selected=groupAll?ids:ids.slice(0,2);
      await service.store.save({id:'installed-'+groupAll,kind:'installation',state:'installed',title:'legacy-native-package',createdAt:'2026-10-14',data:{source:before.request,componentIds:selected,asPackage:true,groupAll}});
      const [view]=await service.prepareUpdate('installed-'+groupAll,false);
      const bundle=await loadBundle(service.store,view.id);
      expect(bundle.pluginName).toBe('legacy-native-package');
      expect(bundle.componentIds).toHaveLength(groupAll?4:2);
      expect(bundle.entrySkill).toBe('acme-collection');
      expect(bundle.groupAll).toBe(groupAll);
      expect(view.invocations).toHaveLength(groupAll?5:3);
    }
  }finally{await rm(root,{recursive:true,force:true});}
});
it('mantém a chamada do pacote quando uma atualização deixa apenas uma skill',async()=>{
  const root=await mkdtemp(join(tmpdir(),'c2c-package-shrink-'));
  try{
    const before=source(2),after=source(1);after.id='shrunk-analysis';
    const ids=inventorySource(before).map(c=>c.id);
    const [previous]=await convertComponents(before,ids,options);
    const service=new AppService({dataRoot:root,readSource:async()=>after,diagnose:async()=>diagnostics});
    await saveBundle(service.store,previous);
    await service.store.save({id:'installed',kind:'installation',state:'installed',title:previous.pluginName,createdAt:'2026-10-14',data:{bundleId:previous.id,source:before.request,componentIds:ids,asPackage:true,groupAll:true}});
    const [view]=await service.prepareUpdate('installed',false);
    expect(view.entrySkill).toBe(previous.entrySkill);
    expect(view.invocations).toEqual(['$acme-collection','$call-0']);
    expect(view.installable).toBe(true);
  }finally{await rm(root,{recursive:true,force:true});}
});
it('Histórico lê chamadas YAML de registros antigos e do pacote ligado à instalação',async()=>{
  const root=await mkdtemp(join(tmpdir(),'c2c-history-calls-'));
  try{
    const service=new AppService({dataRoot:root});
    await service.store.save({id:'bundle',kind:'bundle',state:'ready',title:'fixture',createdAt:'2026-10-14',data:{entrySkill:'group',files:[{path:'skills/folder/SKILL.md',data:Buffer.from('---\nname: advertised\ndescription: Fixture\n---\nPortable').toString('base64')},{path:'skills/group/SKILL.md',data:Buffer.from('---\nname: group\ndescription: Fixture\n---\nGroup').toString('base64')},{path:'skills/folder/assets/template/SKILL.md',data:Buffer.from('---\nname: inert\n---').toString('base64')}]}});
    await service.store.save({id:'install',kind:'installation',state:'installed',title:'fixture',createdAt:'2026-10-14',data:{bundleId:'bundle'}});
    await service.store.save({id:'missing',kind:'installation',state:'removed',title:'old',createdAt:'2026-10-14',data:{bundleId:'absent'}});
    const history=await service.listHistory();
    expect(history.find(r=>r.id==='bundle')?.invocations).toEqual(['$group','$advertised']);
    expect(history.find(r=>r.id==='install')?.invocations).toEqual(['$group','$advertised']);
    expect(history.find(r=>r.id==='missing')?.invocations).toEqual([]);
  }finally{await rm(root,{recursive:true,force:true});}
});
