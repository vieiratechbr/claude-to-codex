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
  if (meta['allowed-tools'] || meta.context || meta['disable-model-invocation']) findings.push({ code: 'source-policy', severity: 'blocking', message: 'A política de ferramentas, isolamento ou ativação do Claude exige revisão específica no Codex.' });
  if (kind === 'agent') findings.push({ code: 'agent-as-skill', severity: 'warning', message: 'Agente adaptado como skill. Não oferece automaticamente isolamento ou delegação de subagente.' });
  const semantic = /\b(?:Claude Code|ClaudeCode|Bash|TodoWrite|AskUserQuestion|MultiEdit)\b|\b(?:tool|ferramenta)\s+(?:Read|Write|Edit|Task)\b|\$ARGUMENTS|\$\{CLAUDE_PLUGIN_ROOT\}/i.test(text);
  return { text: '---\n' + stringify(output) + '---\n\n' + body, findings, semantic };
}
