import { posix } from 'node:path';
import type { BundleFile } from '../shared/contracts';
import { safeRelativePath } from './paths';
import {markdownMetadata} from './inventory';
const MAX_FILES = 16, MAX_FILE_BYTES = 12 * 1024, MAX_TOTAL_BYTES = 48 * 1024;
type SupportingFile = Pick<BundleFile, 'path'|'data'>;
type ExcerptRange = { startByte: number; endByte: number; startLine: number; endLine: number; startsMidLine: boolean; endsMidLine: boolean };
function excerpt(data: Buffer, max: number) {
  if (data.includes(0)) return undefined;
  try { new TextDecoder('utf-8', { fatal: true }).decode(data); } catch { return undefined; }
  const range = (startByte: number, endByte: number): ExcerptRange => ({ startByte, endByte,
    startLine: data.subarray(0,startByte).toString().split('\n').length,
    endLine: data.subarray(0,Math.max(startByte,endByte - 1)).toString().split('\n').length,
    startsMidLine: startByte > 0 && data[startByte - 1] !== 10,
    endsMidLine: endByte < data.length && endByte > 0 && data[endByte - 1] !== 10 });
  if (data.length <= max) return { content: data.toString(), ranges: [range(0,data.length)], omittedBytes: 0, truncated: false };
  const gap = '\n[EXCERPT GAP: middle omitted; head and tail are incomplete source fragments. See byte and line ranges.]\n';
  const budget = Math.max(0,max - Buffer.byteLength(gap));
  let headEnd = Math.floor(budget / 2), tailStart = data.length - (budget - headEnd);
  while (headEnd > 0 && (data[headEnd] & 0xc0) === 0x80) headEnd--;
  while (tailStart < data.length && (data[tailStart] & 0xc0) === 0x80) tailStart++;
  return { content: data.subarray(0,headEnd).toString() + gap + data.subarray(tailStart).toString(),
    ranges: [range(0,headEnd),range(tailStart,data.length)], omittedBytes: tailStart - headEnd, truncated: true };
}
function dependencies(file: { path: string; content: string }): string[] {
  const paths = new Set<string>();
  const skillBase = /^skills\/[^/]+/.exec(file.path)?.[0] || posix.dirname(file.path);
  const add = (value: string, markdown = false, packageRoot = false) => {
    value = value.replace(/[?#].*$/, '');
    try { value = decodeURIComponent(value); } catch { return; }
    if (!value || /^(?:[a-z]+:|\/|#)/i.test(value) || /[*{}]/.test(value)) return;
    const base = packageRoot ? '' : !markdown && /^(references|scripts|assets)\//.test(value) ? skillBase : posix.dirname(file.path);
    try { paths.add(safeRelativePath(posix.normalize(posix.join(base,value)))); } catch {}
  };
  for (const match of file.content.matchAll(/\]\(<?([^\s)>]+)>?(?:\s+[^)]*)?\)/g)) add(match[1],true);
  for (const match of file.content.matchAll(/(?<![a-zA-Z0-9_./-])(?:references|scripts|assets)\/[a-zA-Z0-9_%./-]+\.[a-zA-Z0-9]+/g)) add(match[0]);
  for (const match of file.content.matchAll(/(?:"\$\{C2C_RESOURCE_ROOT\}\/([^"\r\n]+)"|'\$\{C2C_RESOURCE_ROOT\}\/([^'\r\n]+)'|\$\{C2C_RESOURCE_ROOT\}\/([a-zA-Z0-9_%./-]+\.[a-zA-Z0-9]+)\b)/g)) add(match[1]||match[2]||match[3],false,true);
  for (const match of file.content.matchAll(/(["'`])((?:source-context|codex-compat|skills)\/[^"'`\r\n]+)\1/g)) add(match[2],false,true);
  for (const match of file.content.matchAll(/(?<![a-zA-Z0-9_./-])(?:source-context|codex-compat|skills)\/[a-zA-Z0-9_%./-]+\.[a-zA-Z0-9]+/g)) add(match[0],false,true);
  for (const match of file.content.matchAll(/\/([a-zA-Z0-9-]+):([a-zA-Z0-9-]+)/g)) {
    paths.add(`skills/${match[1]}/references/${match[2]}.md`);
    paths.add(`commands/${match[1]}/${match[2]}.md`);
  }
  return [...paths].slice(0,512);
}
export function selectSemanticContext(target: { path: string; content: string }, supporting: readonly SupportingFile[], activeSkillPaths: readonly string[]) {
  const available = new Map(supporting.map(file => [file.path, file]));
  // Generated execution/evaluation contracts govern the port, even when the
  // source never named them. Preserve them before bulky source references can
  // exhaust the bounded context; they remain read-only supporting evidence.
  const contracts=['codex-compat/runtime.md','codex-compat/evaluation.md'].filter(path=>available.has(path));
  const queued = [...contracts,...dependencies(target)], aliases: string[] = []; const seen = new Set<string>([target.path]);
  for (const path of activeSkillPaths) {
    if (path === target.path) continue;
    const name = path.split('/').at(-2)!;
    let advertised:string|undefined;
    try{const source=available.get(path);const metadata=source&&markdownMetadata(source.data.toString());if(metadata&&typeof metadata.name==='string'&&/^[a-z0-9][a-z0-9-]{0,59}$/.test(metadata.name))advertised=metadata.name;}catch{}
    if ([name,advertised].some(alias=>alias&&new RegExp('(^|[^a-z0-9_-])'+alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=$|[^a-z0-9_-])','i').test(target.content))) aliases.push(path);
  }
  const files: { path: string; content: string; originalBytes: number; truncated: boolean; ranges: ExcerptRange[]; omittedBytes: number }[] = [];
  const unavailable: { path: string; reason: string }[] = []; let totalBytes = 0, omittedCount = 0;
  const omit = (path: string, reason: string) => { omittedCount++; if (unavailable.length < 64) unavailable.push({ path, reason }); };
  let index = 0, aliasIndex = 0;
  for (let step = 0; step < 2048 && (index < queued.length || aliasIndex < aliases.length); step++) {
    const path = index < queued.length ? queued[index++] : aliases[aliasIndex++]; if (seen.has(path)) continue; seen.add(path);
    const source = available.get(path);
    if (!source) { omit(path,'not-preserved'); continue; }
    if (/\/SKILL\.md$/.test(path) && !activeSkillPaths.includes(path)) continue;
    if (files.length >= MAX_FILES) { omit(path,'file-count-limit'); continue; }
    const budget = Math.min(MAX_FILE_BYTES, MAX_TOTAL_BYTES - totalBytes);
    if (budget <= 0 || budget < 256 && source.data.length > budget) { omit(path,'total-byte-limit'); continue; }
    const selected = excerpt(source.data, budget);
    if (selected === undefined) { omit(path,'binary'); continue; }
    totalBytes += Buffer.byteLength(selected.content);
    files.push({ path, ...selected, originalBytes: source.data.length });
    queued.push(...dependencies({ path, content: selected.content }));
  }
  omittedCount += queued.length - index + aliases.length - aliasIndex;
  const paths: string[] = []; let inventoryBytes = 2;
  for (const path of new Set([...files.map(file => file.path), ...available.keys()])) {
    const bytes = Buffer.byteLength(JSON.stringify(path)) + (paths.length ? 1 : 0);
    if (paths.length >= 256 || inventoryBytes + bytes > 16 * 1024) break;
    paths.push(path); inventoryBytes += bytes;
  }
  return { readOnly: true, files, unavailable, omittedCount, totalBytes, inventory: { paths, total: available.size, omitted: available.size - paths.length, truncated: paths.length < available.size } };
}
