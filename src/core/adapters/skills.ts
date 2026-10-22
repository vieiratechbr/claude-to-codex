import { stringify } from 'yaml';
import { markdownMetadata } from '../inventory';
import { slug } from '../paths';
import type { Finding } from '../../shared/contracts';
export function claudeSyntaxMarkers(text: string): string[] {
  text=text.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/,'');
  const code: string[] = []; const prose: string[] = []; const invocationCode:string[]=[];let fence: { char: string; length: number }|undefined;
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
  // Product attribution is not a requirement for the source harness. Keep every
  // other platform/API occurrence detectable, including on the same line.
  const behavior = (narrative + '\n' + code.join('\n')).replace(/\bClaude Code Game Studios\b/g, 'CCGS source project');
  for(const match of prose.join('\n').matchAll(/(`+)([\s\S]*?)\1/g))invocationCode.push(match[2]);
  return [...new Set([...(behavior.match(/\b(?:Claude Code|ClaudeCode|TodoWrite|AskUserQuestion|MultiEdit|TaskCreate|TaskGet|TaskList|TaskUpdate)\b|\b(?:tool|ferramenta|use|usar)\s+(?:Read|Write|Edit|Task)\b|\$ARGUMENTS|\$\{CLAUDE_[A-Z_]+\}|\/\w[\w-]*:[\w-]+/gi)||[]),...((narrative+'\n'+invocationCode.join('\n')).match(/(?<!\\)\$\d+(?![a-zA-Z0-9_])/g)||[]),...(/\bBash\s*\(/.test(behavior)?['Bash']:[]),...(/!`[^`]+`/.test(text)?['dynamic-command']:[])])];
}
export function adaptSkill(text: string, name: string, kind: 'skill'|'command'|'agent' = 'skill'): { text: string; findings: Finding[]; semantic: boolean; manualOnly:boolean } {
  const findings: Finding[] = []; let meta: ReturnType<typeof markdownMetadata> = {};
  try { meta = markdownMetadata(text); } catch { findings.push({ code: 'invalid-frontmatter', severity: 'blocking', message: 'Cabeçalho Markdown inválido.' }); }
  const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
  const output: Record<string,unknown> = { name: slug(typeof meta.name === 'string' ? meta.name : name), description: typeof meta.description === 'string' && meta.description.trim() ? meta.description : 'Workflow adaptado de ' + name };
  if (typeof meta.license === 'string') output.license = meta.license;
  const portable = new Set(['name','description','license','metadata','compatibility','author','version','argument-hint']);
  const provenance:Record<string,unknown>={};const notes:string[]=[];
  if(meta['user-invocable']===true)portable.add('user-invocable');
  if(typeof meta['disable-model-invocation']==='boolean'){portable.add('disable-model-invocation');provenance['disable-model-invocation']=meta['disable-model-invocation'];}
  if(typeof meta.model==='string'&&meta.model.trim()&&meta.model.length<=200){
    portable.add('model');provenance.model=meta.model;
    if(meta.model!=='inherit'){
      findings.push({code:'source-model',severity:'warning',message:'Preferência de modelo da origem: '+meta.model+'. O workflow usa o modelo selecionado na sessão Codex.'});
      notes.push('Use o modelo selecionado na sessão Codex; a preferência da origem permanece nos metadados.');
    }
  }
  if(typeof meta['allowed-tools']==='string'||Array.isArray(meta['allowed-tools'])&&meta['allowed-tools'].every(tool=>typeof tool==='string')){
    portable.add('allowed-tools');provenance['allowed-tools']=meta['allowed-tools'];
    findings.push({code:'source-tool-approval',severity:'warning',message:'As aprovações automáticas de ferramentas da origem não são transferidas. Valem as ferramentas, permissões e confirmações da sessão Codex.'});
    notes.push('As aprovações automáticas da origem não são transferidas. Use somente ferramentas disponíveis e respeite as permissões e confirmações da sessão Codex.');
  }
  for (const key of Object.keys(meta)) {
    if (!portable.has(key)) findings.push({ code: 'source-policy', severity: 'blocking', message: 'Campo funcional sem equivalente comprovado no Codex: ' + key });
  }
  if (meta.metadata !== undefined) output.metadata = meta.metadata;
  if(Object.keys(provenance).length)output.metadata={...(meta.metadata&&typeof meta.metadata==='object'&&!Array.isArray(meta.metadata)?meta.metadata as Record<string,unknown>:{}),'claude-to-codex':provenance};
  if (meta.compatibility !== undefined) output.compatibility = meta.compatibility;
  if (typeof meta['argument-hint'] === 'string') findings.push({ code: 'argument-hint', severity: 'info', message: 'Entrada esperada: ' + meta['argument-hint'] });
  if (kind === 'agent') findings.push({ code: 'agent-as-skill', severity: 'warning', message: 'Agente adaptado como skill. Não oferece automaticamente isolamento ou delegação de subagente.' });
  const dynamic = /!`[^`]+`/.test(body);
  if (dynamic) findings.push({ code: 'dynamic-command', severity: 'blocking', message: 'Injeção dinâmica de comandos do Claude não tem equivalente comprovado. Adapte o workflow explicitamente.' });
  const semantic = dynamic||claudeSyntaxMarkers(body).length > 0;
  return { text: '---\n' + stringify(output) + '---\n\n' + (notes.length?'## Ambiente da skill\n\n'+notes.join('\n\n')+'\n\n':'')+body, findings, semantic, manualOnly:meta['disable-model-invocation']===true };
}
