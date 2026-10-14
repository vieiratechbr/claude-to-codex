import { posix } from 'node:path';
import type { BundleFile } from '../shared/contracts';
import { safeRelativePath } from './paths';
import {markdownMetadata} from './inventory';
const MAX_FILES = 16, MAX_FILE_BYTES = 24 * 1024, MAX_TOTAL_BYTES = 128 * 1024;
type SupportingFile = Pick<BundleFile, 'path'|'data'>;
function excerpt(data: Buffer, max: number): string | undefined {
  if (data.includes(0)) return undefined;
  try { new TextDecoder('utf-8', { fatal: true }).decode(data); } catch { return undefined; }
  for (let end = Math.min(data.length, max); end >= Math.max(0, Math.min(data.length,max) - 3); end--) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(data.subarray(0,end)); } catch {}
  }
}
function dependencies(file: { path: string; content: string }): string[] {
  const paths = new Set<string>();
  const skillBase = /^skills\/[^/]+/.exec(file.path)?.[0] || posix.dirname(file.path);
  const add = (value: string, markdown = false) => {
    value = value.replace(/[?#].*$/, '');
    if (!value || /^(?:[a-z]+:|\/|#)/i.test(value) || /[*{}]/.test(value)) return;
    const base = !markdown && /^(references|scripts|assets)\//.test(value) ? skillBase : posix.dirname(file.path);
    try { paths.add(safeRelativePath(posix.normalize(posix.join(base,value)))); } catch {}
  };
  for (const match of file.content.matchAll(/\]\(<?([^\s)>]+)>?(?:\s+[^)]*)?\)/g)) add(match[1],true);
  for (const match of file.content.matchAll(/(?:references|scripts|assets)\/[a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+/g)) add(match[0]);
  for (const match of file.content.matchAll(/\/([a-zA-Z0-9-]+):([a-zA-Z0-9-]+)/g)) {
    paths.add(`skills/${match[1]}/references/${match[2]}.md`);
    paths.add(`commands/${match[1]}/${match[2]}.md`);
  }
  return [...paths].slice(0,512);
}
export function selectSemanticContext(target: { path: string; content: string }, supporting: readonly SupportingFile[], activeSkillPaths: readonly string[]) {
  const available = new Map(supporting.map(file => [file.path, file]));
  const queued = dependencies(target); const seen = new Set<string>([target.path]);
  for (const path of activeSkillPaths) {
    if (path === target.path) continue;
    const name = path.split('/').at(-2)!;
    let advertised:string|undefined;
    try{const source=available.get(path);const metadata=source&&markdownMetadata(source.data.toString());if(metadata&&typeof metadata.name==='string'&&/^[a-z0-9][a-z0-9-]{0,59}$/.test(metadata.name))advertised=metadata.name;}catch{}
    if ([name,advertised].some(alias=>alias&&target.content.toLowerCase().includes(alias.toLowerCase()))) queued.push(path);
  }
  const files: { path: string; content: string; originalBytes: number; truncated: boolean }[] = [];
  const unavailable: { path: string; reason: string }[] = []; let totalBytes = 0, omittedCount = 0;
  const omit = (path: string, reason: string) => { omittedCount++; if (unavailable.length < 64) unavailable.push({ path, reason }); };
  for (let index = 0; index < queued.length && index < 2048; index++) {
    const path = queued[index]; if (seen.has(path)) continue; seen.add(path);
    const source = available.get(path);
    if (!source) { omit(path,'not-preserved'); continue; }
    if (/\/SKILL\.md$/.test(path) && !activeSkillPaths.includes(path)) continue;
    if (files.length >= MAX_FILES) { omit(path,'file-count-limit'); continue; }
    if (totalBytes >= MAX_TOTAL_BYTES) { omit(path,'total-byte-limit'); continue; }
    const content = excerpt(source.data, Math.min(MAX_FILE_BYTES, MAX_TOTAL_BYTES - totalBytes));
    if (content === undefined) { omit(path,'binary'); continue; }
    const bytes = Buffer.byteLength(content); totalBytes += bytes;
    files.push({ path, content, originalBytes: source.data.length, truncated: bytes < source.data.length });
    queued.push(...dependencies({ path, content }));
  }
  if (queued.length > 2048) omittedCount += queued.length - 2048;
  const paths: string[] = []; let inventoryBytes = 2;
  for (const path of new Set([...files.map(file => file.path), ...available.keys()])) {
    const bytes = Buffer.byteLength(JSON.stringify(path)) + (paths.length ? 1 : 0);
    if (paths.length >= 256 || inventoryBytes + bytes > 16 * 1024) break;
    paths.push(path); inventoryBytes += bytes;
  }
  return { readOnly: true, files, unavailable, omittedCount, totalBytes, inventory: { paths, total: available.size, omitted: available.size - paths.length, truncated: paths.length < available.size } };
}
