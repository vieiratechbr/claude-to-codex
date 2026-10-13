import { stringify } from 'yaml';
import { markdownMetadata } from '../inventory';
import { slug } from '../paths';
import type { Finding } from '../../shared/contracts';
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
  // A Markdown language label is portable; retain checks inside the block itself.
  const behavior = text.replace(/^[ \t]*(?:`{3,}|~{3,})[ \t]*bash(?=[ \t\r\n]|$)[^\r\n]*$/gim, '');
  const semantic = /\b(?:Claude Code|ClaudeCode|Bash|TodoWrite|AskUserQuestion|MultiEdit)\b|\b(?:tool|ferramenta|use|usar)\s+(?:Read|Write|Edit|Task)\b|\$ARGUMENTS|\$\{CLAUDE_[A-Z_]+\}|(?<!\\)\$\d+|\/\w[\w-]*:[\w-]+/i.test(behavior);
  return { text: '---\n' + stringify(output) + '---\n\n' + body, findings, semantic };
}
