import {expect,it} from 'vitest';
import type {BundleFile,SourceSnapshot} from '../../src/shared/contracts';
import {classifyResourceRoles} from '../../src/core/resource-roles';

function fixture(originals:Record<string,string>,destinations:Record<string,string>={}){
  const snapshot:SourceSnapshot={id:'roles',request:{url:'https://github.com/example/workflows'},commit:'a'.repeat(40),warnings:[],files:Object.entries(originals).map(([path,text])=>({path,data:Buffer.from(text),mode:'100644',oid:''}))};
  const files:BundleFile[]=snapshot.files.map(file=>({path:destinations[file.path]||'source-context/'+file.path,sourcePath:file.path,data:file.data,sha256:''}));
  return{snapshot,files};
}

it('keeps root upgrade history and its obsolete dependency graph out of operative instructions',()=>{
  const f=fixture({
    '.claude/skills/check/SKILL.md':'Read `UPGRADING.md` for history. Follow `.claude/docs/standards.md` now.',
    'UPGRADING.md':'Old versions used `.claude/docs/obsolete.md` and /legacy.',
    '.claude/docs/obsolete.md':'Run /obsolete.',
    '.claude/docs/standards.md':'Read `coordination.md` and follow its approval gate.',
    '.claude/docs/coordination.md':'Preserve user approval before writing.'
  },{'.claude/skills/check/SKILL.md':'skills/check/SKILL.md'});
  const roles=classifyResourceRoles(f.snapshot,f.files);
  expect([...roles.instructions].sort()).toEqual(['skills/check/SKILL.md','source-context/.claude/docs/coordination.md','source-context/.claude/docs/standards.md']);
  expect(roles.provenance.has('source-context/UPGRADING.md')).toBe(true);
  expect(roles.provenance.has('source-context/.claude/docs/obsolete.md')).toBe(true);
});

it('treats explicit catalog specs as evaluation data without following their negative fixture paths',()=>{
  const f=fixture({
    '.claude/skills/check/SKILL.md':'Read `Test Framework/catalog.yaml`, [rubric](../../../Test%20Framework/rubric.md) and [framework rules](../../../Test%20Framework/CLAUDE.md).',
    'Test Framework/catalog.yaml':'skills:\n  - name: check\n    spec: specs/check.md\nagents:\n  - name: reviewer\n    spec: Test Framework/specs/reviewer.md\n',
    'Test Framework/specs/check.md':'Negative fixture: read `.claude/docs/obsolete.md` and run /obsolete.',
    'Test Framework/specs/reviewer.md':'Fixture transcript: /legacy must be rejected.',
    'Test Framework/.claude/rules/unused.md':'Do not activate this framework-only scope automatically.',
    'Test Framework/CLAUDE.md':'Read `rubric.md` before evaluating.',
    'Test Framework/rubric.md':'Follow `.claude/docs/evaluator.md`.',
    '.claude/docs/evaluator.md':'Keep independent evaluation honest.',
    '.claude/docs/obsolete.md':'Run /obsolete.'
  },{'.claude/skills/check/SKILL.md':'skills/check/SKILL.md'});
  const roles=classifyResourceRoles(f.snapshot,f.files);
  expect([...roles.evaluations].sort()).toEqual(['source-context/Test Framework/catalog.yaml','source-context/Test Framework/specs/check.md','source-context/Test Framework/specs/reviewer.md']);
  expect(roles.instructions.has('source-context/Test Framework/CLAUDE.md')).toBe(true);
  expect(roles.instructions.has('source-context/Test Framework/rubric.md')).toBe(true);
  expect(roles.instructions.has('source-context/.claude/docs/evaluator.md')).toBe(true);
  expect(roles.provenance.has('source-context/.claude/docs/obsolete.md')).toBe(true);
  expect(roles.provenance.has('source-context/Test Framework/.claude/rules/unused.md')).toBe(true);
});

it('seeds preserved skill references, role definitions and source controls while leaving examples as provenance',()=>{
  const f=fixture({
    '.claude/skills/check/SKILL.md':'Start here.',
    '.claude/skills/check/references/contracts.md':'Follow `.claude/docs/standards.md`.',
    '.claude/skills/check/templates/plan.md':'Run /template.',
    '.claude/skills/check/fixtures/case.md':'Run /fixture.',
    '.claude/skills/check/assets/reference.md':'Run /asset.',
    '.claude/agents/reviewer.md':'Follow `.claude/docs/review.md`.',
    '.agents/agents/second.md':'Follow `.claude/docs/review.md`.',
    '.claude/rules/local.md':'Follow `.claude/docs/standards.md`.',
    'src/CLAUDE.md':'Follow `.claude/docs/standards.md`.',
    'CLAUDE.md':'Follow `.claude/docs/standards.md`.',
    '.claude/docs/standards.md':'Be careful.',
    '.claude/docs/review.md':'Review real artifacts.',
    '.claude/docs/unreferenced.md':'Run /not-reached.'
  },{
    '.claude/skills/check/SKILL.md':'skills/check/SKILL.md',
    '.claude/skills/check/references/contracts.md':'skills/check/references/contracts.md',
    '.claude/skills/check/templates/plan.md':'skills/check/templates/plan.md',
    '.claude/skills/check/fixtures/case.md':'skills/check/fixtures/case.md',
    '.claude/skills/check/assets/reference.md':'skills/check/assets/reference.md'
  });
  const roles=classifyResourceRoles(f.snapshot,f.files);
  expect([...roles.instructions].sort()).toEqual(['skills/check/SKILL.md','skills/check/references/contracts.md','source-context/.agents/agents/second.md','source-context/.claude/agents/reviewer.md','source-context/.claude/docs/review.md','source-context/.claude/docs/standards.md','source-context/.claude/rules/local.md','source-context/CLAUDE.md','source-context/src/CLAUDE.md']);
  for(const path of ['skills/check/templates/plan.md','skills/check/fixtures/case.md','skills/check/assets/reference.md','source-context/.claude/docs/unreferenced.md'])expect(roles.provenance.has(path),path).toBe(true);
});

it('does not activate directory inventories, generated context maps, or fenced code references',()=>{
  const f=fixture({
    '.claude/skills/check/SKILL.md':'Browse `.claude/docs/`.\n```md\nRead `.claude/docs/fixture.md`.\n~~~\n```\n[map](references/source-context-map.md)',
    '.claude/docs/fixture.md':'Run /fixture.',
    '.claude/docs/unrelated.md':'Run /unrelated.',
    '.claude/skills/check/references/source-context-map.md':'[all docs](../../../../.claude/docs/unrelated.md)'
  },{'.claude/skills/check/SKILL.md':'skills/check/SKILL.md','.claude/skills/check/references/source-context-map.md':'skills/check/references/source-context-map.md'});
  const roles=classifyResourceRoles(f.snapshot,f.files);
  expect([...roles.instructions]).toEqual(['skills/check/SKILL.md']);
  expect(roles.provenance.size).toBe(3);
});

it('resolves literal quoted paths, imports and encoded links with anchors inside the owning plugin',()=>{
  const f=fixture({
    'plugins/one/.claude-plugin/plugin.json':'{"name":"one"}',
    'plugins/one/.claude/skills/check/SKILL.md':'Read ".claude/docs/model tiers.md".\n@".claude/docs/agent teams.md"\n[settings](<../../docs/settings%20guidance.md#scope>)\n[coordination][rules]\n[rules]: ../../docs/coordination.md#approval "Rules"',
    'plugins/one/.claude/docs/model tiers.md':'Read `collaborative.md`.',
    'plugins/one/.claude/docs/agent teams.md':'Respect team availability.',
    'plugins/one/.claude/docs/settings guidance.md':'Respect settings scope.',
    'plugins/one/.claude/docs/coordination.md':'Keep approval gates.',
    'plugins/one/.claude/docs/collaborative.md':'Collaborate faithfully.',
    '.claude/docs/model tiers.md':'Wrong owner.'
  },{'plugins/one/.claude/skills/check/SKILL.md':'skills/check/SKILL.md'});
  const roles=classifyResourceRoles(f.snapshot,f.files);
  expect([...roles.instructions].sort()).toEqual(['skills/check/SKILL.md','source-context/plugins/one/.claude/docs/agent teams.md','source-context/plugins/one/.claude/docs/collaborative.md','source-context/plugins/one/.claude/docs/coordination.md','source-context/plugins/one/.claude/docs/model tiers.md','source-context/plugins/one/.claude/docs/settings guidance.md']);
  expect(roles.provenance.has('source-context/.claude/docs/model tiers.md')).toBe(true);
});

it('keeps administrative files at repository and plugin roots as provenance but follows scoped normative documents',()=>{
  const f=fixture({
    'plugins/one/.claude-plugin/plugin.json':'{"name":"one"}',
    'plugins/one/.claude/skills/check/SKILL.md':'Read `SECURITY.md`, `CONTRIBUTING.md`, `UPGRADING.md`, `README.md`, `CHANGELOG.md`, `LICENSE.md`, `NOTICE.md` and `docs/SECURITY.md`.',
    ...Object.fromEntries(['SECURITY','CONTRIBUTING','UPGRADING','README','CHANGELOG','LICENSE','NOTICE'].map(name=>['plugins/one/'+name+'.md','Read `.claude/docs/obsolete.md`.'])),
    'plugins/one/docs/SECURITY.md':'Follow `.claude/docs/current.md`.',
    'plugins/one/.claude/docs/current.md':'Use current controls.',
    'plugins/one/.claude/docs/obsolete.md':'Run /obsolete.'
  },{'plugins/one/.claude/skills/check/SKILL.md':'skills/check/SKILL.md'});
  const roles=classifyResourceRoles(f.snapshot,f.files);
  expect([...roles.instructions].sort()).toEqual(['skills/check/SKILL.md','source-context/plugins/one/.claude/docs/current.md','source-context/plugins/one/docs/SECURITY.md']);
  expect(roles.provenance.has('source-context/plugins/one/.claude/docs/obsolete.md')).toBe(true);
});

it('follows current converted references as well as the original source dependency graph',()=>{
  const f=fixture({
    '.claude/skills/check/SKILL.md':'Read `.claude/docs/original.md`.',
    '.claude/docs/original.md':'Read `nested.md`.',
    '.claude/docs/nested.md':'Keep the source contract.',
    '.claude/docs/selected.md':'Keep the selected dependency.'
  },{'.claude/skills/check/SKILL.md':'skills/check/SKILL.md'});
  f.files.find(file=>file.path==='skills/check/SKILL.md')!.data=Buffer.from('Read [selected](../../source-context/.claude/docs/selected.md#contract).');
  const roles=classifyResourceRoles(f.snapshot,f.files);
  expect([...roles.instructions].sort()).toEqual(['skills/check/SKILL.md','source-context/.claude/docs/nested.md','source-context/.claude/docs/original.md','source-context/.claude/docs/selected.md']);
});

it('does not promote a spec even when another active document directly links to its fixture',()=>{
  const f=fixture({
    '.claude/skills/check/SKILL.md':'Read `Test/catalog.yaml` and [case](../../../Test/specs/check.md).',
    'Test/catalog.yaml':'skills:\n  - spec: specs/check.md\n',
    'Test/specs/check.md':'Read `.claude/docs/obsolete.md`.',
    '.claude/docs/obsolete.md':'Run /obsolete.'
  },{'.claude/skills/check/SKILL.md':'skills/check/SKILL.md'});
  const roles=classifyResourceRoles(f.snapshot,f.files);
  expect(roles.evaluations.has('source-context/Test/specs/check.md')).toBe(true);
  expect([...roles.instructions]).toEqual(['skills/check/SKILL.md']);
  expect(roles.provenance.has('source-context/.claude/docs/obsolete.md')).toBe(true);
});

it('ignores fenced examples nested in block quotes or indented lists',()=>{
  const f=fixture({
    '.claude/skills/check/SKILL.md':'> ```md\n> Read `.claude/docs/quoted-example.md`.\n> ```\n\n    ~~~~md\n    Read `.claude/docs/list-example.md`.\n    ~~~~\nRead `.claude/docs/actual.md`.',
    '.claude/docs/quoted-example.md':'Run /obsolete.',
    '.claude/docs/list-example.md':'Run /legacy.',
    '.claude/docs/actual.md':'Follow this actual control.'
  },{'.claude/skills/check/SKILL.md':'skills/check/SKILL.md'});
  const roles=classifyResourceRoles(f.snapshot,f.files);
  expect([...roles.instructions].sort()).toEqual(['skills/check/SKILL.md','source-context/.claude/docs/actual.md']);
});

it('matches source preservation when a catalog spec exists at both the owner root and beside the catalog',()=>{
  const f=fixture({
    'plugins/one/.claude-plugin/plugin.json':'{"name":"one"}',
    'plugins/one/.claude/skills/check/SKILL.md':'Read `Test/catalog.yaml` and `specs/check.md`.',
    'plugins/one/Test/catalog.yaml':'skills:\n  - spec: specs/check.md\n',
    'plugins/one/specs/check.md':'A declared negative test fixture.',
    'plugins/one/Test/specs/check.md':'An unrelated document.'
  },{'plugins/one/.claude/skills/check/SKILL.md':'skills/check/SKILL.md'});
  const roles=classifyResourceRoles(f.snapshot,f.files);
  expect(roles.evaluations.has('source-context/plugins/one/specs/check.md')).toBe(true);
  expect(roles.provenance.has('source-context/plugins/one/Test/specs/check.md')).toBe(true);
  expect([...roles.instructions]).toEqual(['skills/check/SKILL.md']);
});

it('follows concrete table basenames under the subdirectory declared by an operative index',()=>{
  const f=fixture({
    '.claude/skills/check/SKILL.md':'Read `.claude/docs/reviews.md` before selecting a review.',
    '.claude/docs/reviews.md':'Definition files are in `.claude/docs/reviews/`.\n\n| ID | Definition |\n| --- | --- |\n| FIRST | first.md |\n| SECOND | `second.md` |',
    '.claude/docs/reviews/first.md':'Model tier: Opus. Read `.claude/docs/standards.md`.',
    '.claude/docs/reviews/second.md':'Model tier: Sonnet.',
    '.claude/docs/reviews/unlisted.md':'An unrelated document in the same directory.',
    '.claude/docs/standards.md':'Use the operative standards.',
    '.claude/docs/unrelated.md':'This inventory sibling is not a dependency.'
  },{'.claude/skills/check/SKILL.md':'skills/check/SKILL.md'});
  const roles=classifyResourceRoles(f.snapshot,f.files);
  expect([...roles.instructions].sort()).toEqual(['skills/check/SKILL.md','source-context/.claude/docs/reviews.md','source-context/.claude/docs/reviews/first.md','source-context/.claude/docs/reviews/second.md','source-context/.claude/docs/standards.md']);
  expect(roles.provenance.has('source-context/.claude/docs/reviews/unlisted.md')).toBe(true);
  expect(roles.provenance.has('source-context/.claude/docs/unrelated.md')).toBe(true);
});

it.each(['<review-id>','[review-id]'])('follows every concrete direct branch of an explicit Markdown family %s',placeholder=>{
  const f=fixture({
    'plugins/one/.claude-plugin/plugin.json':'{"name":"one"}',
    'plugins/one/.claude/skills/check/SKILL.md':'Use `.claude/docs/reviews/'+placeholder+'.md` for the current review.\n```md\nUse `.claude/docs/examples/<example>.md`.\n```',
    'plugins/one/.claude/docs/reviews/first.md':'Model tier: Opus.',
    'plugins/one/.claude/docs/reviews/second.md':'Model tier: Sonnet.',
    'plugins/one/.claude/docs/reviews/nested/unrelated.md':'No recursive family expansion.',
    'plugins/one/.claude/docs/examples/sample.md':'Run /obsolete.',
    '.claude/docs/reviews/wrong-owner.md':'Do not select another plugin owner.'
  },{'plugins/one/.claude/skills/check/SKILL.md':'skills/check/SKILL.md'});
  const roles=classifyResourceRoles(f.snapshot,f.files);
  expect([...roles.instructions].sort()).toEqual(['skills/check/SKILL.md','source-context/plugins/one/.claude/docs/reviews/first.md','source-context/plugins/one/.claude/docs/reviews/second.md']);
});
