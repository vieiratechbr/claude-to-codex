import {expect,it} from 'vitest';
import {convertComponents} from '../../src/core/conversion';
import {inventorySource} from '../../src/core/inventory';
import type {SourceSnapshot} from '../../src/shared/contracts';
const options={dataRoot:'unused',useCodex:false,diagnostics:{authenticated:false,capabilities:{exec:false,pluginAdd:false,marketplaceAdd:false,pluginListJson:false,isolatedConversion:false},findings:[]}};
it.each([false,true])('mantém URL Markdown válida ao relocar nomes Unicode com espaços (angular=%s)',async angular=>{
 const raw='../../../Test/cat%C3%A1logo%20real.yaml#rubric';
 const entries={'.claude/skills/check/SKILL.md':'Read [the baseline]('+(angular?'<'+raw+'>':raw)+' "Rubric guidance") before a verdict.','Test/catálogo real.yaml':'criterion: evidence'};
 const snapshot:SourceSnapshot={id:'reference-uri',request:{url:'https://github.com/acme/fixture'},commit:'a'.repeat(40),warnings:[],files:Object.entries(entries).map(([path,text])=>({path,data:Buffer.from(text),mode:'100644',oid:''}))};
 const [bundle]=await convertComponents(snapshot,[inventorySource(snapshot)[0].id],options);
 expect(bundle.installable,JSON.stringify(bundle.findings)).toBe(true);
 const skill=bundle.files.find(f=>f.path==='skills/check/SKILL.md')!;
 const match=/\[the baseline\]\((<[^>]+>|[^\s)]+) "Rubric guidance"\)/.exec(skill.data.toString());
 expect(match).not.toBeNull();const target=match![1].replace(/^<|>$/g,'');
 expect(target).not.toMatch(/\s/);
 const resolved=decodeURIComponent(new URL(target,'https://bundle.invalid/'+skill.path).pathname.slice(1));
 expect(bundle.files.find(f=>f.path===resolved)?.data.toString()).toBe('criterion: evidence');
 expect(target).toContain('#rubric');
});
