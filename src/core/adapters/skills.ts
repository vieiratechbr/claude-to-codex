import { stringify } from 'yaml';
import { markdownMetadata } from '../inventory';
import { slug } from '../paths';
import type { Finding } from '../../shared/contracts';
export function claudeSyntaxMarkers(text: string): string[] {
  const code: string[] = []; const prose: string[] = []; let fence: { char: string; length: number }|undefined;
  for (const line of text.split(/\r?\n/)) {
    const marker = /^[ \t]*(`{3,}|~{3,})(.*)$/.exec(line);
    if (!fence && marker) { fence = { char: marker[1][0], length: marker[1].length }; continue; }
    if (fence) {
      if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
      else code.push(line);
    } else prose.push(line);
  }
  const narrative = prose.join('\n').replace(/(`+)([\s\S]*?)\1/g, (all, _ticks: string, content: string) => {
    if (/^(?:\$ARGUMENTS|\$\{CLAUDE_[A-Z_]+\})$/i.test(content)) return all;
    code.push(content); return '[code]';
  }).replace(/\b(?:do not|don't|never) assume(?: a| the)?\s+(`+)(?:\$ARGUMENTS|\$\{CLAUDE_[A-Z_]+\})\1(?: variable)?\s+(?:exists|is available)(?: in Codex)?/gi, '');
  const behavior = narrative + '\n' + code.join('\n');
  return [...new Set(behavior.match(/\b(?:Claude Code|ClaudeCode|Bash|TodoWrite|AskUserQuestion|MultiEdit)\b|\b(?:tool|ferramenta|use|usar)\s+(?:Read|Write|Edit|Task)\b|\$ARGUMENTS|\$\{CLAUDE_[A-Z_]+\}|(?<!\\)\$\d+|\/\w[\w-]*:[\w-]+/gi) || [])];
}
export function adaptSkill(text: string, name: string, kind: 'skill'|'command'|'agent' = 'skill'): { text: string; findings: Finding[]; semantic: boolean } {
  const findings: Finding[] = []; let meta: ReturnType<typeof markdownMetadata> = {};
  try { meta = markdownMetadata(text); } catch { findings.push({ code: 'invalid-frontmatter', severity: 'blocking', message: 'Cabeçalho Markdown inválido.' }); }
  const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
  const output: Record<string,unknown> = { name: slug(typeof meta.name === 'string' ? meta.name : name), description: typeof meta.description === 'string' && meta.description.trim() ? meta.description : 'Workflow adaptado de ' + name };
  if (typeof meta.license === 'string') output.license = meta.license;
  const portable = new Set(['name','description','license','metadata','compatibility','author','version','argument-hint']);
  for (const key of Object.keys(meta)) {
    if (!portable.has(key)) findings.push({ code: 'source-policy', severity: 'blocking', message: 'Campo funcional sem equivalente comprovado no Codex: ' + key });
  }
  if (meta.metadata !== undefined) output.metadata = meta.metadata;
  if (meta.compatibility !== undefined) output.compatibility = meta.compatibility;
  if (typeof meta['argument-hint'] === 'string') findings.push({ code: 'argument-hint', severity: 'info', message: 'Entrada esperada: ' + meta['argument-hint'] });
  if (kind === 'agent') findings.push({ code: 'agent-as-skill', severity: 'warning', message: 'Agente adaptado como skill. Não oferece automaticamente isolamento ou delegação de subagente.' });
  const dynamic = /!`[^`]+`/.test(body);
  if (dynamic) findings.push({ code: 'dynamic-command', severity: 'blocking', message: 'Injeção dinâmica de comandos do Claude não tem equivalente comprovado. Adapte o workflow explicitamente.' });
  const semantic = claudeSyntaxMarkers(text).length > 0;
  return { text: '---\n' + stringify(output) + '---\n\n' + body, findings, semantic };
}
