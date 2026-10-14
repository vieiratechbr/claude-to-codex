import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { adaptWithCodex } from '../../src/core/semantic';
import { checkedProcess } from '../../src/core/process';
import type { BundleFile, ConversionOptions } from '../../src/shared/contracts';

vi.mock('../../src/core/process', async importOriginal => ({ ...await importOriginal<typeof import('../../src/core/process')>(), checkedProcess: vi.fn() }));
const temporary: string[] = [];
afterEach(async () => {
  vi.mocked(checkedProcess).mockReset();
  for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true });
});

async function promptFor(content: string, supportingFiles: readonly Pick<BundleFile, 'path' | 'data'>[], active: { path: string; content: string }[] = []) {
  const dataRoot = await mkdtemp(join(tmpdir(), 'c2c-semantic-context-')); temporary.push(dataRoot);
  const options: ConversionOptions = { useCodex: true, dataRoot, diagnostics: { authenticated: true, codexPath: 'codex.exe', capabilities: { exec: true, pluginAdd: true, marketplaceAdd: true, pluginListJson: true, isolatedConversion: true }, findings: [] } };
  let prompt = '';
  vi.mocked(checkedProcess).mockImplementation(async (_exe, _args, processOptions) => {
    const current = String(processOptions?.stdin);
    const request = JSON.parse(current.split('Material a converter:\n')[1]);
    if (request.files[0].path === 'skills/design-system/SKILL.md') prompt = current;
    return { stdout: Buffer.from(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify({ files: [{ path: request.files[0].path, edits: [] }], findings: [{ code: 'source-workflow', severity: 'blocking', message: 'Source workflow needs review.' }] }) } })), stderr: '', exitCode: 0 };
  });
  const input = { files: [{ path: 'skills/design-system/SKILL.md', content }, ...active], findings: [], supportingFiles };
  await adaptWithCodex(input, options);
  const selected = JSON.parse(prompt.split('Material a converter:\n')[1]).supportingContext;
  expect(selected).toBeDefined();
  return { prompt, context: selected };
}
const support = (path: string, content: string | Buffer) => ({ path, data: typeof content === 'string' ? Buffer.from(content) : content });

it('exposes linked references, local scripts and named active auxiliary skills as read-only context', async () => {
  const target = 'Read [workflow](references/workflow.md). Use /slides:create and visual-brand-system.';
  const active = [
    { path: 'skills/slides/SKILL.md', content: 'Create slides with [create](references/create.md).' },
    { path: 'skills/visual-brand-system/SKILL.md', content: 'Use the visual brand rules.' }
  ];
  const { context } = await promptFor(target, [
    support('skills/design-system/SKILL.md', target),
    support('skills/design-system/references/workflow.md', 'Run `python scripts/design.py` after review.'),
    support('skills/design-system/scripts/design.py', 'print("design")'),
    ...active.map(file => support(file.path, file.content)),
    support('skills/slides/references/create.md', 'Define the slide story.'),
    support('skills/unrelated/SKILL.md', 'Unrelated skill.'),
    support('cli/assets/skills/visual-brand-system/SKILL.md', 'Inactive original template.'),
    support('README.md', 'Unrelated repository readme.')
  ], active);
  expect(context.files.map((file: { path: string }) => file.path).sort()).toEqual([
    'skills/design-system/references/workflow.md', 'skills/design-system/scripts/design.py',
    'skills/slides/SKILL.md', 'skills/slides/references/create.md', 'skills/visual-brand-system/SKILL.md'
  ]);
  expect(context.files.find((file: { path: string }) => file.path.endsWith('design.py')).content).toBe('print("design")');
});

it('finds a preserved command reference even when no editable namespace skill is available', async () => {
  const { context } = await promptFor('Use /slides:create.', [
    support('skills/slides/references/create.md', 'Existing create workflow.'),
    support('commands/slides/create.md', 'Existing source command definition.'),
    support('commands/slides/delete.md', 'Unrelated delete command.')
  ]);
  expect(context.files.map((file: { path: string }) => file.path).sort()).toEqual(['commands/slides/create.md', 'skills/slides/references/create.md']);
});

it('excludes binary and inert skill files while distinguishing missing and unreadable evidence', async () => {
  const { context, prompt } = await promptFor('Use template-only. Read `references/missing.md`, [image](assets/logo.png) and [binary](references/binary.md).', [
    support('cli/assets/skills/template-only/SKILL.md', 'Inactive template.'),
    support('skills/design-system/assets/logo.png', Buffer.from([137, 80, 78, 71, 0])),
    support('skills/design-system/references/binary.md', Buffer.from([65, 0, 66])),
    support('docs/unrelated.md', 'Unrelated detail.')
  ]);
  expect(context.files).toEqual([]);
  expect(context.unavailable).toEqual(expect.arrayContaining([
    { path: 'skills/design-system/references/missing.md', reason: 'not-preserved' },
    { path: 'skills/design-system/assets/logo.png', reason: 'binary' },
    { path: 'skills/design-system/references/binary.md', reason: 'binary' }
  ]));
  expect(prompt).not.toContain('Inactive template.');
  expect(prompt).not.toContain('Unrelated detail.');
});

it('limits a UTF-8 excerpt without splitting characters and reports its original size', async () => {
  const data = '😀'.repeat(20_000);
  const { context } = await promptFor('Read `references/large.md`.', [support('skills/design-system/references/large.md', data)]);
  expect(context.files).toHaveLength(1);
  expect(Buffer.byteLength(context.files[0].content)).toBe(24 * 1024);
  expect(context.files[0].content).not.toContain('\uFFFD');
  expect(context.files[0]).toMatchObject({ truncated: true, originalBytes: 80_000 });
});

it('includes at most sixteen excerpts and reports the referenced files omitted by count', async () => {
  const files = Array.from({ length: 20 }, (_, i) => support(`skills/design-system/references/ref-${i}.md`, `Reference ${i}.`));
  const { context } = await promptFor(files.map(file => `[read](${file.path.replace('skills/design-system/', '')})`).join('\n'), files);
  expect(context.files).toHaveLength(16);
  expect(context.unavailable.filter((file: { reason: string }) => file.reason === 'file-count-limit')).toHaveLength(4);
  expect(context.omittedCount).toBe(4);
});

it('caps the combined UTF-8 excerpt budget at 128 KiB and reports partial and omitted resources', async () => {
  const files = Array.from({ length: 8 }, (_, i) => support(`skills/design-system/references/ref-${i}.md`, 'A'.repeat(30 * 1024)));
  const { context } = await promptFor(files.map(file => `[read](${file.path.replace('skills/design-system/', '')})`).join('\n'), files);
  expect(context.files).toHaveLength(6);
  expect(context.files.reduce((total: number, file: { content: string }) => total + Buffer.byteLength(file.content), 0)).toBe(128 * 1024);
  expect(context.files[5]).toMatchObject({ truncated: true });
  expect(Buffer.byteLength(context.files[5].content)).toBe(8 * 1024);
  expect(context.unavailable.filter((file: { reason: string }) => file.reason === 'total-byte-limit')).toHaveLength(2);
});

it('bounds the path inventory while keeping evidence for a directly referenced resource', async () => {
  const files = Array.from({ length: 600 }, (_, i) => support(`docs/${String(i).padStart(3, '0')}-${'x'.repeat(150)}.md`, 'Unrelated document.'));
  files.push(support('skills/design-system/references/important.md', 'Relevant evidence.'));
  const { context, prompt } = await promptFor('Read `references/important.md`.', files);
  expect(context.files.map((file: { path: string }) => file.path)).toEqual(['skills/design-system/references/important.md']);
  expect(context.inventory.paths).toContain('skills/design-system/references/important.md');
  expect(context.inventory.paths.length).toBeLessThanOrEqual(256);
  expect(Buffer.byteLength(JSON.stringify(context.inventory.paths))).toBeLessThanOrEqual(16 * 1024);
  expect(context.inventory.total).toBe(601);
  expect(context.inventory.omitted).toBe(601 - context.inventory.paths.length);
  expect(context.inventory.truncated).toBe(true);
  expect(Buffer.byteLength(prompt)).toBeLessThan(1024 * 1024);
});
it('rejects an attempt to edit a supporting reference instead of the editable skill', async () => {
  const dataRoot=await mkdtemp(join(tmpdir(),'c2c-context-edit-'));temporary.push(dataRoot);
  vi.mocked(checkedProcess).mockResolvedValue({stdout:Buffer.from(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify({files:[{path:'skills/main/references/guide.md',edits:[]}],findings:[]})}})),stderr:'',exitCode:0});
  const options:ConversionOptions={useCodex:true,dataRoot,diagnostics:{authenticated:true,codexPath:'codex.exe',capabilities:{exec:true,pluginAdd:true,marketplaceAdd:true,pluginListJson:true,isolatedConversion:true},findings:[]}};
  await expect(adaptWithCodex({files:[{path:'skills/main/SKILL.md',content:'Read [guide](references/guide.md).'}],findings:[],supportingFiles:[support('skills/main/references/guide.md','Protected reference.')]},options)).rejects.toThrow(/arquivos permitidos/i);
});
it('identifies an active auxiliary skill by its advertised metadata name',async()=>{
  const helper={path:'skills/foundation/SKILL.md',content:'---\nname: brand-guide\ndescription: Brand guidance\n---\nUse consistent identity.'};
  const {context}=await promptFor('Use brand-guide.',[support(helper.path,helper.content)],[helper]);
  expect(context.files.map((file:{path:string})=>file.path)).toContain('skills/foundation/SKILL.md');
});
