import type { Finding } from '../shared/contracts';
import {posix} from 'node:path';

export interface WorkflowPortabilityOptions {
  sourcePath: string;
  targetPath: string;
  /** Source workflow names, without slash, to the actual installed skill names. */
  skillCalls: Record<string, string>;
  sourceToTarget?: Record<string, string>;
  /** Known live project inputs/outputs: never substitute packaged examples. */
  projectPaths?: readonly string[];
  /** Installed resources that this workflow needs to evolve in an editable fork. */
  requiredMutableResources?: readonly string[];
  /** Exact package destinations for resolving explicit relative Markdown links. */
  installedResourcePaths?: readonly string[];
}
export interface WorkflowPortabilityResult { text: string; findings: Finding[]; semanticNeeded: boolean; installedWritePaths: string[] }

const decision = 'At each decision or consent gate required by the resolved automation mode or explicit contract, present the draft and actionable choices together in the same response. Use a supported Codex question interface when available and permitted for this decision; otherwise present clear numbered choices in conversation, including the original options and custom-answer path. Wait for an actual user reply where approval is required. A skipped, dismissed, empty or unavailable question is not approval or consent. Preserve the exact approved write scope and every separately required gate; retain guided/autonomous exceptions and decision logging.';
const delegation = 'Use actual Codex subagent delegation with the preserved specialist instructions, a bounded brief, relevant artifact excerpts and the original return/write-authority contract. Independent review requires a verified clean context without the authoring conversation. If actual delegation or the required clean context is unavailable, stop the dependent review phase and hand off the relevant explicit review-skill invocation to the user for a fresh Codex chat with artifact-only inputs. Never simulate specialist results internally. Instructions do not establish a separate sandbox or tool restriction; any required technical isolation remains a runtime precondition. Parallelize independent work only and collect every result before dependent phases.';
const taskState = 'Persist progress with stable task IDs, status, owner, dependencies and artifact paths in an available plan or checkpoint-backed checklist. Create/read/list/update that state at the original milestones and reload it on resume. A checklist is progress tracking only; strict shared-team scheduling or native task-control guarantees still require an actual runtime implementation.';
const instructionLoading = 'Explicitly read and load the mapped project conventions and each applicable scoped rule before work, using supported AGENTS.md discovery or explicit startup reads with the original scope and precedence. Verify required standards were actually loaded. Do not overwrite existing AGENTS.md files. Do not assume automatic source imports or path-glob activation in Codex; preserve local/private preferences and report unavailable required inputs.';
const optionalLocalInstructions = 'Treat optional developer-local instructions as private project-local runtime inputs: read them only if present, retain their original scope, and do not package or publish them. Their absence is not a missing bundle resource; a separately required instruction document must still be resolved.';
const projectRuntimeInputs = 'Resolve the documented optional template, legacy configuration fallback or generated project-file reference as a project-local runtime input/output under the selected game-project root, retaining its original condition and write-approval scope. Do not claim an absent file was bundled. If an input is required by the active branch and is missing or unreadable, stop that dependent step and name what must be supplied; an optional absence follows only the original documented fallback.';
const projectInstructionWrites = 'For a project-instruction write, resolve <project-root> to the selected game project, read existing AGENTS.md and applicable scoped instructions first, show the exact proposed changes and named paths, and merge only the authorized or approved sections under the original consent/mode contract. Preserve unrelated content and local/private boundaries; do not replace an existing instruction file wholesale. Source convention resources remain read-only evidence. Never modify an installed package or cache; verify the project instruction file is actually loaded before dependent work. An unresolved source import or scope guarantee remains unmet until its target loading route is verified.';
const skillMaintenance = 'Resolve the requested skill through the actual Codex skill catalog and its advertised SKILL.md path. Before maintenance edits, export the complete skill, reference pages, scripts, assets, contracts, provenance and required dependencies to an explicitly approved editable fork under <project-root>/.agents/skills/<name>/, or prepare a managed export/update through the converter. Inspect any existing fork and merge only the approved change; never overwrite it or mutate an installed package/cache. Bind the baseline, retest and rollback to that same exact fork and preserve original content for every changed file. Named test invocations in this run must inspect that fork rather than silently choosing an installed skill with the same name. Keep/revert decisions, scores, catalog updates and publication retain their original consent and verification gates; installed evidence/spec catalogs are read-only and any changed catalog/result needs an approved project-local destination. Verify discovery and compatibility before offering the fork as usable; managed publication/update is a separate authorized action.';
const skillDiscovery = 'Resolve <resolved-Codex-skills> through the actual Codex skill catalog and each advertised SKILL.md location, and resolve <resolved-specialist-definitions> through the preserved role/specialist definition resource map or actual target agent registry. These are lookup descriptions, not native environment variables or a promised common folder. Enumerate the actual available targets, bind the requested name to its exact path, load its complete active instruction dependencies, and retain original missing/unreadable verdicts and checked/total denominators. Do not assume legacy source project folders exist or silently substitute a different target. Audits are read-only unless an original separate output/update gate authorizes a project-local destination.';
const telemetry = 'After each approved section or milestone, save approved content and update the canonical checkpoint. Use trustworthy target context telemetry only when available; otherwise state that the exact percentage is unavailable, do not invent a percentage, and recommend a checkpoint/fresh-chat handoff at this milestone. On resume, read the checkpoint and active artifacts before continuing the next incomplete section.';

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function instructionWrite(line:string,isResource?:(value:string)=>boolean):boolean{
  const resource=isResource||((value:string)=>{
    value=value.replace(/^["']|["']$/g,'');
    return /^(?:\$\{C2C_RESOURCE_ROOT\}\/|source-context\/)/.test(value)||/(?:^|\/)CLAUDE\.md$/.test(value);
  });
  for(const match of line.matchAll(/(?<![<])(?:\d*>>?)\s*("[^"\n]+"|'[^'\n]+'|[^\s;&|]+)/g))if(resource(match[1]))return true;
  for(const match of line.matchAll(/\b(?:Write|Edit)\s+(?:path|file_path)\s*=\s*("[^"\n]+"|'[^'\n]+'|[^\s;]+)/g))if(resource(match[1]))return true;
  for(const command of line.matchAll(/(?:^|[;&|`]\s*|\bthen\s+)(tee|touch|rm|mkdir|cp|mv|install)\s+([^;\n&|`]+)/g)){
    const operands=[...command[2].matchAll(/"[^"\n]+"|'[^'\n]+'|[^\s;&|]+/g)].map(m=>m[0]).filter(value=>!value.startsWith('-'));
    const targets=/^(?:cp|install)$/.test(command[1])?operands.slice(-1):operands;
    if(targets.some(resource))return true;
  }
  if(/\b(?:sed|perl|ruby)\b[^\n]*(?:\s-[A-Za-z]*i(?:\s|["'.=]|$)|\s--in-place\b)/.test(line)){
    if([...line.matchAll(/"[^"\n]+"|'[^'\n]+'|[^\s;&|]+/g)].some(match=>resource(match[0])))return true;
  }
  return false;
}

interface InstalledReference {path:string;start:number;end:number}
function activeClauseAt(text:string,offset:number):boolean{
  let fence:{char:string;size:number}|undefined,frontmatter=/^---\r?\n/.test(text),first=true;
  for(const line of text.slice(0,offset).split(/\r?\n/)){
    if(frontmatter){if(!first&&/^---\s*$/.test(line))frontmatter=false;first=false;continue;}
    const marker=/^[ \t]*([`]{3,}|~{3,})(.*)$/.exec(line);
    if(!marker)continue;
    if(!fence)fence={char:marker[1][0],size:marker[1].length};
    else if(marker[1][0]===fence.char&&marker[1].length>=fence.size&&!marker[2].trim())fence=undefined;
  }
  return !fence&&!frontmatter&&!/^\s*>/.test(text.slice(text.lastIndexOf('\n',offset-1)+1,offset));
}
const engineReferenceWriteClause=[
  'In the same CLAUDE.md write, set the **Engine Version Reference** import to the',
  'chosen engine. Find the line marked `ENGINE-REFERENCE-IMPORT` (an',
  '`@docs/engine-reference/<engine>/VERSION.md` line under its comment) and Edit it',
  'to point at the configured engine:',
  '- Godot → `@docs/engine-reference/godot/VERSION.md`',
  '- Unity → `@docs/engine-reference/unity/VERSION.md`',
  '- Unreal → `@docs/engine-reference/unreal/VERSION.md`','',
  'This keeps a Unity or Unreal project from loading the Godot reference in every',
  'session. It is idempotent — re-running `/setup-engine` for a different',
  'engine rewrites the same line. (The target `docs/engine-reference/<engine>/`',
  'directory is created in Section 7, Populate Engine Reference Docs, if it does not yet exist.)'
].join('\n');
const engineReferenceVerifyClause=[
  '## 8. Verify the CLAUDE.md Import','',
  '**This import was already written in Section 4 — do not edit it again and do not',
  'ask again.** Section 4 sets it as part of the same CLAUDE.md write, anchored to',
  'the `ENGINE-REFERENCE-IMPORT` marker. This step only confirms the result.','',
  'Read `CLAUDE.md` and confirm the line under the marker reads:','',
  '```markdown','@docs/engine-reference/<engine>/VERSION.md','```','',
  'with `<engine>` the engine just configured. If it still points at a different',
  'engine, Section 4 did not complete — go back and finish it rather than patching',
  'the line here.','',
  '> **Why this is a check and not a second write.** Repeating the edit here with',
  '> its own approval prompt would ask the user twice for one change, and the second',
  '> ask would be for work already done. Locate the line by its marker, never by the',
  '> `## Engine Version Reference` heading — the marker exists precisely so the line',
  '> can still be found when the heading moves or is reworded.'
].join('\n');
const automationModeClause=[
  '```','At each decision point in this skill:','',
  '1. Classify the decision: major or minor (see §Major vs Minor above).',
  '2. Check whether the decision falls into an `automation_always_ask`',
  '   category: scope_changes, file_deletions, schema_changes,',
  '   architecture_decisions, version_bumps, external_calls.',
  '3. Apply the mode rule:','',
  '   collaborative:           AskUserQuestion always.',
  '   guided + major:          AskUserQuestion with capped options + recommendation.',
  '   guided + minor:          State recommendation inline, proceed.',
  '   autonomous + always_ask: AskUserQuestion (regardless of mode).',
  '   autonomous + other:      Pick recommended, log via log_decision, proceed.',
  '4. If the question comes back skipped, dismissed or empty, it is not an',
  '   answer: see §Every mode: a question with no answer.','```'
].join('\n');
interface HelperInvocationInput extends InstalledReference {invocationEnd:number}
function helperInvocationInputs(line:string,canonical:(value:string)=>string|undefined):HelperInvocationInput[]{
  const inputs:HelperInvocationInput[]=[];
  // The runner and --script operand are executable inputs, even when prose
  // introduces the invocation with "after writing" or "save them: run".
  // Exempt only these exact token spans; helper arguments and later commands
  // still participate in ordinary immutable-resource mutation checks.
  for(const command of line.matchAll(/\b(?:python(?:3(?:\.\d+)?)?(?:\.exe)?|py(?:\.exe)?)(?:\s+-3(?:\.\d+)?)?\s+("[^"\n]+"|'[^'\n]+'|[^\s;|&`]+)(?=\s|`|$)/g)){
    if(canonical(command[1])!=='codex-compat/run-helper.py')continue;
    const runnerStart=command.index!+command[0].lastIndexOf(command[1]),argsStart=command.index!+command[0].length;
    const args=/^[^;&|`\n]*/.exec(line.slice(argsStart))![0],invocationEnd=argsStart+args.length;
    inputs.push({path:'codex-compat/run-helper.py',start:runnerStart,end:runnerStart+command[1].length,invocationEnd});
    const tokens=[...args.matchAll(/(?:[^\s"';&|`]+|"[^"\n]*"|'[^'\n]*')+/g)];
    for(let index=0;index<tokens.length;index++){
      const token=tokens[index],flag=token[0];
      if(flag==='--')break;
      if(flag==='--project'){index++;continue;}
      if(flag.startsWith('--project='))continue;
      let value:string,start:number;
      if(flag==='--script'){
        const operand=tokens[++index];if(!operand)break;
        value=operand[0];start=argsStart+operand.index!;
      }else if(flag.startsWith('--script=')){
        value=flag.slice('--script='.length);start=argsStart+token.index!+'--script='.length;
      }else break;
      const path=canonical(value);if(path)inputs.push({path,start,end:start+value.length,invocationEnd});
    }
  }
  return inputs;
}
function installedResourceChecks(text:string,options:WorkflowPortabilityOptions):{writes:string[];staleReads:string[]}{
  const known=new Set([...Object.values(options.sourceToTarget||{}),options.targetPath,...options.requiredMutableResources||[]]);
  const linkedTargets=new Set([...known,...options.installedResourcePaths||[]]);
  const knownMatchers=[...known].filter(path=>text.includes(path)).sort((a,b)=>b.length-a.length).map(path=>({path,pattern:new RegExp('(?<![\\p{L}\\p{N}\\p{M}_/.-])'+escape(path)+'(?![\\p{L}\\p{N}\\p{M}_/.-])','gu')}));
  const quotedMatchers=['`','"',"'"].map(delimiter=>new RegExp(escape(delimiter)+'([^'+escape(delimiter)+'\\n]+)'+escape(delimiter),'g'));
  const canonical=(value:string):string|undefined=>{
    value=value.replace(/^[`"']|[`"']$/g,'').replace(/\\/g,'/');
    const absolute=/^\$\{?C2C_RESOURCE_ROOT\}?\//.test(value);
    value=value.replace(/^\$\{?C2C_RESOURCE_ROOT\}?\//,'').replace(/^(?:\.\.?\/)+/,'');
    return absolute||/^(?:source-context|codex-compat|skills)\//.test(value)||known.has(value)?value:undefined;
  };
  const writes=new Set<string>(),staleReads=new Set<string>();let historicalQuote=false,frontmatter=/^---\r?\n/.test(text),first=true,fence:string|undefined,shellFence=false;
  for(const line of text.split(/\r?\n/)){
    if(frontmatter){if(!first&&/^---\s*$/.test(line))frontmatter=false;first=false;continue;}
    const marker=/^\s*(`{3,}|~{3,})([^\s]*)\s*$/.exec(line);
    if(marker){if(!fence){fence=marker[1];shellFence=/^(?:sh|bash|shell|zsh)$/i.test(marker[2]);}else if(marker[1][0]===fence[0]&&marker[1].length>=fence.length){fence=undefined;shellFence=false;}continue;}
    if(/^\s*>/.test(line)){
      historicalQuote||=/\b(?:historical|archived|inert)\b[^\n]*\b(?:example|quote|excerpt)\b|\b(?:example|quote|excerpt)\b[^\n]*\b(?:historical|archived|inert)\b/i.test(line);
      if(historicalQuote)continue;
    }else historicalQuote=false;
    if(/^\s*#(?!#|\s*[A-Za-z].*`)/.test(line))continue;
    const refs:InstalledReference[]=[];
    const add=(value:string,start:number)=>{const path=canonical(value);if(path)refs.push({path,start,end:start+value.length});};
    for(const pattern of quotedMatchers){
      for(const match of line.matchAll(pattern))add(match[1],match.index!+1);
    }
    for(const {path,pattern} of knownMatchers){
      if(!line.includes(path))continue;
      for(const match of line.matchAll(pattern))add(path,match.index!);
    }
    for(const match of line.matchAll(/\[[^\]\n]*\]\((<[^>\n]+>|[^\s)]+)\)/g)){
      const raw=match[1].replace(/^<|>$/g,'');
      if(/^(?:[a-z]+:|\/|#)/i.test(raw))continue;
      try{
        const resolved=posix.normalize(posix.join(posix.dirname(options.targetPath),decodeURIComponent(raw.split(/[?#]/,1)[0]))),path=linkedTargets.has(resolved)?resolved:canonical(resolved);
        if(path)refs.push({path,start:match.index!,end:match.index!+match[0].length});
      }catch{}
    }
    for(const match of line.matchAll(/(?<![\w/.-])(?:\$\{?C2C_RESOURCE_ROOT\}?\/|(?:\.\.\/)*(?:source-context|codex-compat|skills)\/)[\p{L}\p{N}_.@%/+${}-]+/gu))add(match[0],match.index!);
    const complete=refs.filter(ref=>!refs.some(other=>other!==ref&&other.start<=ref.start&&other.end>ref.end));
    const invocationInputs=helperInvocationInputs(line,canonical);
    for(const ref of complete){
      const before=line.slice(0,ref.start).split(/[.!?;](?=\s|$)/).at(-1)||'',after=line.slice(ref.end);
      // A past participle may describe a different output ("the written code").
      // Do not treat the artifact noun following that adjective as a destination.
      const actions=[...before.matchAll(/\b(write|writ(?:ing|ten)|creat(?:e|ing)|updat(?:e|ing)|edit(?:ing)?|modif(?:y|ying)|merg(?:e|ing)|append(?:ing)?|delet(?:e|ing)|remov(?:e|ing)|overwrit(?:e|ing)|sav(?:e|ing)|restor(?:e|ing)|mov(?:e|ing)|copy)\b/gi)].filter(match=>match[1].toLowerCase()!=='written'||!/^\s+(?:code|output|summary|report|content|text|document|changes?)\b/i.test(before.slice(match.index!+match[0].length)));
      const action=actions.at(-1),negated=/\b(?:never|do not|don't|must not|cannot|no changes? (?:may|should|must) be)\b/i.test(before)||!!action&&/\bnothing\s+(?:(?:is|was|will|may|must|should|shall)\s+)*(?:be\s+)?$/i.test(before.slice(0,action.index!));
      const between=action?before.slice(action.index!+action[0].length):'';
      const sourceRead=action&&(/inside a blockquote\s*[—-]/i.test(between)||/\b(?:read|load|inspect|consult|compare|using|against|follow\w*|conform\w*|according to|governed by|specified in|documented in|defined in|the format under|inside a blockquote\s*[—-])\b/i.test(between)||/\(\s*(?:schema|format)\s*:\s*[`"']?$/i.test(between)||/^writ(?:e|ing)$/i.test(action[1])&&/\bin\b[^\n]*'s\s+template\s*\(\s*[`"']?$/i.test(between)||/\bfrom\b/i.test(between)&&!/^(?:remove|delete)$/i.test(action[1]));
      const inlineCopySource=[...line.matchAll(/`(?:cp|install)\s+([^`\n]+)`/g)].some(command=>{
        const start=command.index!+command[0].indexOf(command[1]);
        const operands=[...command[1].matchAll(/"[^"\n]+"|'[^'\n]+'|[^\s;&|]+/g)].filter(match=>!match[0].startsWith('-'));
        return operands.slice(0,-1).some(operand=>canonical(operand[0])===ref.path&&ref.start>=start+operand.index!&&ref.end<=start+operand.index!+operand[0].length);
      });
      const copySource=inlineCopySource||action?.[1].toLowerCase()==='copy'&&!/\b(?:to|into|over)\b/i.test(before.slice(action.index!+action[0].length));
      const invocationInput=invocationInputs.find(input=>input.path===ref.path&&ref.start>=input.start&&ref.end<=input.end);
      const actionAfter=invocationInput?line.slice(invocationInput.invocationEnd):after;
      const followingAction=!/\b(?:never|do not|don't|must not|cannot)\b/i.test(actionAfter)&&(/^[`"'\s,]*(?:then\s+|and\s+)?(?:update|edit|modify|overwrite|delete|remove|restore)\s+(?:it\b|its\b|the (?:entry|catalog|resource)\b)/i.test(actionAfter)||/^[`"'\s]*(?:(?:must|should|may|will|shall|is|are)\s+)+(?:be\s+)?(?:updated|edited|modified|overwritten|written|deleted|removed|restored)\b/i.test(actionAfter));
      const shellWrite=instructionWrite(shellFence?line:line.replace(/^\s*(?:>\s*)+/,''),value=>canonical(value)===ref.path);
      if(shellWrite||!negated&&(action&&!sourceRead&&!copySource&&!invocationInput||followingAction)){writes.add(ref.path);continue;}
      if(!options.requiredMutableResources?.includes(ref.path))continue;
      // Packaged content remains valid only as an explicitly immutable baseline,
      // seed or provenance read; all live state must follow the editable fork.
      const clause=(before+line.slice(ref.start,ref.end)+after.split(/[.!?;](?=\s|$)/)[0]);
      if(!negated&&!/\b(?:baseline|seed|provenance|schema.only|read.only (?:evidence|reference)|immutable (?:evidence|reference))\b/i.test(clause))staleReads.add(ref.path);
    }
  }
  return{writes:[...writes],staleReads:[...staleReads]};
}

/**
 * Ports recognizable instruction clauses, not source programs or platform policy.
 * Code fences, source frontmatter and dynamic shell preludes are intentionally inert.
 * Unknown/strict requirements remain visible and are returned for semantic review.
 */
export function adaptWorkflowText(input: string, options: WorkflowPortabilityOptions): WorkflowPortabilityResult {
  if (!/\.(?:md|markdown)$/i.test(options.sourcePath)) return { text: input, findings: [], semanticNeeded: false, installedWritePaths: [] };
  const findings: Finding[] = [];
  const emitted = new Set<string>();
  let semanticNeeded = false;
  const finding = (code: string, severity: Finding['severity'], message: string) => {
    if (!emitted.has(code)) { emitted.add(code); findings.push({ code, severity, message, file: options.targetPath }); }
    if (severity === 'blocking') semanticNeeded = true;
  };
  const explained = new Set<string>();
  const maintenanceRun = /\b(?:baseline|retest|re-test)\b/i.test(input) && /\b(?:keep or revert|improvement loop|improved version|improved skill)\b/i.test(input) && /\bskill\b/i.test(input);
  const explain = (text: string, id: string, content: string): string => {
    if (explained.has(id) || input.includes(content) || text.includes(content)) return text;
    explained.add(id);
    return text.trimEnd() + '\n\n' + content + '\n';
  };
  const nativeRoutes = (text: string) => {
    const links=[...text.matchAll(/\[[^\]\n]*\]\((?:<[^>\n]+>|[^\s)]+)\)/g)].map(match=>({start:match.index!,end:match.index!+match[0].length}));
    return text.replace(/(?<![\w:/])\/([a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)?)(?![\w/-])/g, (whole, name: string, offset: number) => {
    if(links.some(link=>offset>=link.start&&offset<link.end))return whole;
    const prefix = text.slice(Math.max(0, offset - 100), offset);
    if (/\b(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+$/i.test(prefix)) return whole;
    const target = options.skillCalls[name] ?? options.skillCalls['/' + name];
    if (target && /^[a-z0-9][a-z0-9:_-]*$/i.test(target)) return '$' + target;
    if (name === 'clear') return 'a fresh Codex chat after saving the checkpoint';
    if (name === 'compact') return 'the supported context-compaction action, if available, otherwise a checkpoint and fresh Codex chat';
    if (/\b(?:run|invoke|use|call|execute)\s+[`"']?$/i.test(prefix)) {
      finding('workflow-route-unresolved', 'blocking', 'A workflow invocation has no verified installed-name mapping: ' + whole + '.');
    }
    return whole;
    });
  };

  const port = (original: string): string => {
    let text = original;
    if(/\$ARGUMENTS(?![\w\[])/.test(text)){
      const phrase='the complete argument text following the explicit skill invocation';
      const code:string[]=[];
      const protectedText=text.replace(/(`+)([\s\S]*?)\1/g,(whole,ticks:string,content:string)=>{if(content==='$ARGUMENTS')return phrase;code.push(whole);return 'C2C_ARGUMENT_CODE_'+(code.length-1)+'_END';});
      const adapted=protectedText.replace(/\$ARGUMENTS(?![\w\[])/g,phrase);
      const changed=adapted!==protectedText||protectedText.includes(phrase)&&!text.includes(phrase);
      text=adapted.replace(/C2C_ARGUMENT_CODE_(\d+)_END/g,(_whole,index:string)=>code[Number(index)]);
      if(changed){
        text=explain(text,'invocation-arguments','Read invocation arguments from the actual user request, preserving the original quoting, spaces, flags, defaults and validation grammar. This is request text, not a shell or environment variable. Do not execute or interpolate the argument text as code.');
        finding('workflow-invocation-arguments-ported','info','Arguments are read from the explicit target invocation with original grammar and defaults; no automatic source interpolation is assumed.');
      }
    }
    let projectInstructionWrite = false;
    text = text.replace(/(?:[a-zA-Z0-9_.-]+\/)*CLAUDE\.md\b/g, (path: string, offset: number) => {
      const start = text.lastIndexOf('\n', offset) + 1;
      const before = text.slice(start, offset);
      const after = text.slice(offset + path.length, text.indexOf('\n', offset) < 0 ? text.length : text.indexOf('\n', offset));
      const action = /\b(?:writ(?:e|ing|ten)|creat(?:e|es|ed|ing)|updat(?:e|es|ed|ing)|edit(?:s|ed|ing)?|modif(?:y|ies|ied|ying)|merg(?:e|es|ed|ing)|populat(?:e|ed|ing)|sav(?:e|ed|ing)|restor(?:e|ed|ing))\b[^.!?\n]{0,160}$/i.test(before)
        || /^\s*[`*)]*\s*(?:write|update|edit|creation)\b/i.test(after);
      const prohibited = /\b(?:never|do not|must not|cannot|don't)\b[^.!?\n]{0,70}\b(?:write|create|update|edit|modify|overwrite)\b/i.test(before);
      if (!action || prohibited) return path;
      const source = Object.entries(options.sourceToTarget || {}).find(([, target]) => target === path)?.[0] || path;
      const directory = source.slice(0, -'CLAUDE.md'.length).replace(/\/$/, '');
      projectInstructionWrite = true;
      return '<project-root>/' + (directory && directory !== '.claude' ? directory + '/' : '') + 'AGENTS.md';
    });
    if (projectInstructionWrite) {
      text = explain(text, 'project-instruction-writes', projectInstructionWrites);
      finding('workflow-project-instructions-write-ported', 'warning', 'Project instruction edits target approved scoped AGENTS.md merges; packaged source conventions remain read-only. Verify actual project loading and retain unresolved import/scope controls.');
    }
    if (maintenanceRun) {
      text = text.replace(/(?<![\w/])\.claude\/skills\/([^\s`"'()]+\.(?:md|markdown))/g, '<project-root>/.agents/skills/$1');
      text = explain(text, 'skill-maintenance', skillMaintenance);
      finding('workflow-skill-maintenance-fork-required', 'warning', 'Maintenance uses an approved project-local skill fork or managed export/update; baseline, retest and rollback must bind to that fork and never edit the installed cache.');
    }
    if (/\.claude\/(?:skills|agents)\/(?:\*|\[|<)/.test(text)) {
      text = text.replace(/\.claude\/skills\/(?=\*|\[|<)/g, '<resolved-Codex-skills>/')
        .replace(/\.claude\/agents\/(?=\*|\[|<)/g, '<resolved-specialist-definitions>/');
      text = explain(text, 'skill-discovery', skillDiscovery);
      finding('workflow-target-discovery-ported', 'warning', 'Dynamic source skill/agent lookups use the actual Codex catalog and preserved role resource map; no legacy directory or native placeholder variable is assumed.');
    }
    // Only a structural-test section is eligible; source frontmatter is protected.
    text = text.replace(/^(\s*[-*]\s+(?:\[[ xX]\]\s*)?)Has required frontmatter fields:\s*([^\n]+)$/gmi, (line:string,prefix:string,fields:string) => {
      if(!/\b(?:argument-hint|user-invocable|allowed-tools|model|context)\b/.test(fields))return line;
      const native=fields.split(',').map(field=>field.trim()).filter(field=>!/^`?(?:argument-hint|user-invocable|allowed-tools|model|context)`?$/.test(field));
      finding('workflow-test-schema-ported', 'info', 'Source-specific structural-test predicates were replaced with target schema and functional invocation-policy checks; behavioral verdicts remain.');
      return prefix+'Has supported Codex metadata fields: '+native.join(', ')+'. Validate actual invocation policy, resolvable instruction resources and all functional operation, consent and delegation requirements. Record source-only fields as provenance, not required target execution fields.';
    });
    text = text.replace(/(#{2,4}[^\n]*(?:Required Frontmatter|Required Metadata)[^\n]*\n)([\s\S]*?)(?=\n#{2,4} |$)/gi, (_all, heading: string, body: string) => {
      if (!/allowed-tools|model:|argument-hint|user-invocable/.test(body)) return heading + body;
      const retained = body.replace(/^\s*-\s*`?(?:allowed-tools|model|argument-hint|user-invocable):`?[^\n]*\n?/gmi, '');
      finding('workflow-test-schema-ported', 'info', 'Source-specific structural-test predicates were replaced with target schema and functional invocation-policy checks; behavioral verdicts remain.');
      return heading + retained + '\nValidate the supported Codex skill metadata schema and actual installed invocation policy, resolvable instruction resources, and functional operation/consent/delegation requirements. Retain source model/tool fields as provenance, not required target execution fields. Preserve substantive behavioral assertions and the original missing/malformed/verdict distinctions.\n';
    });
    text = text.replace(/An assertion that names a literal value[^\n]*(?:\n(?!\s*\n)[^\n]*)*/gi, paragraph => {
      if (!/(?:model:|frontmatter key|tool name)/i.test(paragraph)) return paragraph;
      finding('workflow-test-literals-ported', 'info', 'Literal platform test assertions now evaluate actual supported target behavior and keep substantive contracts.');
      return 'For a platform-specific assertion, validate the supported Codex schema, actual invocation policy and functional operation/delegation/consent contract. Preserve source literals as provenance and report the deliberate predicate change. Every substantive behavioral assertion and verdict rank remains required; removing an unsupported token alone is never a pass.';
    });
    text = text.replace(/(#{2,4}[^\n]*Fork Context Complexity[^\n]*\n)([\s\S]*?)(?=\n#{2,4} |$)/g, (_all, heading: string, body: string) => {
      if (!body.includes('context: fork')) return heading + body;
      const adapted = body.replace(/frontmatter contains `context: fork`/g, 'the workflow requires independent delegated execution')
        .replace(/`context: fork` is (?:set|present)/g, 'independent delegated execution is required')
        .replace(/`context: fork`/g, 'the independent delegated-execution contract');
      finding('workflow-test-context-ported', 'info', 'Fork-complexity predicates now inspect the actual independent delegation contract while preserving phase counts and verdicts.');
      return heading + adapted + '\nCheck the actual target delegation/context contract; this rubric does not invent a native metadata field or waive required independent context.\n';
    });
    text = text.replace(/^([^\n]*\bCheck\s+\d+\s+warn[^\n]*)$/gmi, line => line.includes('context: fork')
      ? line.replace(/`context: fork` (?:set|is set)/g, 'independent delegated execution required') : line);
    text = text.replace(/((?:\*\*)?FAIL(?:\*\*)? if )`allowed-tools` includes [^\n]*?(?:`?Write`? or `?Edit`?|the available file writer or the available precise file editor)([^\n]*no ask-before-write language[^\n]*)/gi, '$1the workflow performs writes or edits$2');
    text = text.replace(/Write or Edit in allowed-tools but no ask-before-write language/g, 'the workflow performs writes or edits but no ask-before-write language');
    text = text.replace(/(#{2,4}[^\n]*Argument Hint Plausibility[^\n]*\n)([\s\S]*?)(?=\n#{2,4} |$)/g, (_all, heading: string, body: string) => {
      if (!body.includes('argument-hint')) return heading + body;
      return heading.replace('Argument Hint', 'Argument Grammar') + body.replace(/`argument-hint`/g, 'The documented argument grammar').replace(/\bthe hint\b|\bhint\b/gi, 'the documented argument grammar')
        + '\nCheck the supported metadata or documented input contract and its actual Parse Arguments behavior; a source-only frontmatter field is not required. Keep all empty/mismatched-mode warnings.\n';
    });

    if (/AskUserQuestion|\b(?:approval|question|closing|multi-tab) widget\b|\bwidget\b[^.\n]{0,80}\b(?:draft|prompt|choices|options)\b/i.test(text)) {
      text = text.replace(/`?AskUserQuestion`?/g, 'the Codex decision prompt');
      text = text.replace(/\bNEVER use plain text\.?/gi, 'Use a supported question interface or clear numbered choices in conversation.');
      text = text.replace(/\bNever plain text\./gi, 'Use supported question UI or clear numbered choices in conversation.');
      text = text.replace(/never end ([^.]{0,140}?)with plain text(?: after\s*file writes)?\s*[—–-]\s*always/gi, 'end $1with an actionable decision prompt — always');
      text = text.replace(/plain text "May I\?" is not\s+sufficient\./gi, 'A question without an actual answer is not sufficient.');
      text = text.replace(/Use the structured tool with/gi, 'Present the decision prompt with');
      text = text.replace(/\b(?:approval widget|question widget|closing widget|multi-tab widget|multi.select widget)\b/gi, 'decision prompt');
      text = text.replace(/\bwidget\b/gi, (whole, offset: number) => {
        const start = text.lastIndexOf('\n', offset) + 1;
        const end = text.indexOf('\n', offset);
        const line = text.slice(start, end < 0 ? text.length : end);
        return /\b(?:draft|approval|prompt|choices|options|framing|closing|question|decision|close with|per-section)\b/i.test(line) ? 'decision prompt' : whole;
      });
      text = explain(text, 'decision', decision);
      finding('workflow-question-presentation-ported', 'warning', 'Question presentation was adapted; actual consent, choices, modes and write boundaries remain required. Exact source widget rendering is not guaranteed.');
    }

    if (/\b(?:TaskCreate|TaskGet|TaskList|TaskUpdate|TodoWrite)\b/.test(text)) {
      const tasks: Record<string, string> = { TaskCreate: 'create a persisted task entry', TaskGet: 'read a persisted task entry', TaskList: 'list persisted task entries', TaskUpdate: 'update a persisted task entry', TodoWrite: 'update the persisted progress checklist' };
      text = text.replace(/`?\b(TaskCreate|TaskGet|TaskList|TaskUpdate|TodoWrite)\b`?/g, (_match, name: string) => tasks[name]);
      text = explain(text, 'tasks', taskState);
      finding('workflow-task-state-ported', 'info', 'Ordinary task progress operations use persistent state; this does not supply native distributed task controls.');
    }

    text = text.replace(/(?:\*\*)?Model tier:(?:\*\*)?\s*([^|\n]+?)(?=\s*(?:\||$))/gm, (_whole, tier: string) => {
      finding('workflow-source-model-preference-ported', 'warning', 'The role header retains the original source model preference as provenance; execution uses the model selected in the actual Codex session.');
      return 'Source model preference (provenance): ' + tier.trim() + '; use the selected Codex session model';
    });
    text = text.replace(/You have the `Agent` tool to delegate to your sub-specialists\./g, 'Verify actual Codex subagent delegation availability before delegating to your sub-specialists.');
    text = text.replace(/it is up to you, because when you run as a subagent Claude Code lets the\s+`Agent`\s+tool start any agent\.\s+If you have no\s+`Agent`\s+tool\s+\(Claude Code withholds it at\s+its subagent depth limit\),/g, 'that allowed child-role list remains your responsibility; instructions do not technically enforce it. Check the actual target delegation capability and permissions at use. If delegation is unavailable,');

    if (/(?<![\w/.\\-])Agent(?![\w/.\\-]|:)|\bsubagent_type\b|own context window|\bindependent\s+(?:specialist\s+)?(?:review(?:er|s)?|context)\b|fresh Claude Code session/i.test(text)) {
      text = text.replace(/`subagent_type:\s*([^`\n]+)`/g, '`specialist role: $1`');
      text = text.replace(/(?<![\w/.\\-])`?Agent`?(?![\w/.\\-]|:)(?:\s+tool)?/g, 'actual Codex subagent delegation');
      text = text.replace(/fresh Claude Code session/gi, 'fresh Codex chat');
      text = explain(text, 'delegation', delegation);
      finding('workflow-delegation-runtime-required', 'warning', 'Actual subagents and any required clean review context must exist at use; otherwise stop the dependent phase and hand off to a fresh chat. Instructions do not create technical isolation.');
    }

    // A preserved source event helper is not a registered Codex interceptor.
    // Resolve the concrete bundle resource, then require the runner's actual
    // manifest/input contract at use; a filename alone cannot prove execution.
    text = text.replace(/(?:The\s+)?`([^`\n]+\.(?:sh|bash))`\s+hook\s+(?:automatically\s+)?(blocks?|rejects?|validates?)\s+([^\n]+?\.(?=\s|$))/gi, (whole, reference: string, verb: string, checks: string) => {
      if (!/commit/i.test(reference)) return whole;
      const name = reference.replace(/^\$\{?C2C_RESOURCE_ROOT\}?\//, '').replace(/\\/g, '/');
      const candidates = Object.entries(options.sourceToTarget || {}).filter(([source, target]) =>
        name.includes('/') ? source.replace(/\\/g, '/') === name || target === name
          : posix.basename(source.replace(/\\/g, '/')) === name || posix.basename(target) === name);
      const targets = [...new Set(candidates.map(([, target]) => target))];
      const runtime = options.installedResourcePaths;
      const target = targets.length === 1 ? targets[0] : undefined;
      if (!target || !/^(?!\/)(?!.*(?:^|\/)\.\.\/)[^"'\r\n:]+\.(?:sh|bash)$/.test(target)
        || runtime && ![target, 'codex-compat/run-helper.py', 'codex-compat/scripts.json'].every(path => runtime.includes(path))) {
        finding('workflow-event-helper-route-unresolved', 'blocking', 'Required commit validation has no unique preserved helper and executable runner route: ' + reference + '. Retain the requirement and STOP the dependent git commit until the route is resolved.');
        return whole;
      }
      finding('workflow-event-preflight-ported', 'warning', 'Commit validation requires an explicit registered helper invocation with verified project, input protocol and exit status at use; no native event interception is supplied.');
      return 'Before any dependent git commit, read the preserved helper `' + target + '` and its actual input contract, then read `codex-compat/runtime.md` and `codex-compat/scripts.json`; verify this exact helper is registered and its hash and required runtimes are valid. Select the actual project outside the installed package. Execute `python "${C2C_RESOURCE_ROOT}/codex-compat/run-helper.py" --project "${C2C_PROJECT_ROOT}" --script "' + target + '" --` using literal argv under session permissions, only at skill-use time. Derive the real JSON stdin protocol from the helper before invocation: when its parser reads `tool_input.command`, serialize the exact proposed git commit command in the nested object `{"tool_input":{"command":"<exact proposed git commit command>"}}`, pass the UTF-8 JSON to runner stdin and close stdin; do not pass an empty payload or assume command-line arguments replace stdin. If the input contract is unavailable or cannot be determined, STOP the dependent git commit without reporting a pass. The required validation ' + verb + ' ' + checks + ' Preserve and show all warning output from stdout and stderr, including any JSON warning envelope; an advisory warning with exit 0 retains its original meaning. A nonzero exit, missing runtime, failed registration/hash check or unreadable helper means STOP the dependent git commit. Rerun validation for the actual proposed command and current commit contents if either changes. Native hook registration and automatic Codex event interception are unsupported by this prose and are not assumed. Keep the original approval, automation-mode and write-scope gates; a successful preflight is not commit authorization.';
    });
    text = text.replace(/`[^`\n]+\.(?:sh|bash)`\s+shows\s+(?:exactly\s+)?(?:that|the checkpoint)\s+block\s+when\s+the\s+next\s+session\s+opens\./gi, () => {
      finding('workflow-event-resume-ported', 'warning', 'Checkpoint restoration requires an explicit read on resume; automatic session-start delivery is not supplied.');
      return 'On resume or in the next session, explicitly read the actual `<!-- CHECKPOINT -->` … `<!-- /CHECKPOINT -->` block from the selected project\'s `production/session-state/active.md` and the approved active artifacts it names before continuing. Preserve malformed/missing-checkpoint warnings and STOP dependent work until required recovery inputs are resolved. Automatic session-start delivery is not assumed.';
    });
    const nativeStageClaim = /\bThis updates the (?:status line|footer) immediately\.|\bthis anchors your (?:status line|footer) and stage detection\./gi;
    if (nativeStageClaim.test(text)) {
      text = text.replace(nativeStageClaim, 'the saved stage supports subsequent project-stage detection.');
      text = text.replace(/Dual-write keeps backward compatibility with hooks that haven't migrated yet\./g, 'Dual-write retains the documented project-state mirror.');
      text = explain(text, 'stage-status', 'After the originally authorized stage write, verify the read-back of `project.yaml` and `production/stage.txt`, then report the confirmed stage in conversation. If the writes or read-back fail, report that failure and do not claim a saved stage. A native Codex footer or status-line refresh is not supplied or assumed. Preserve the original PASS/CONCERNS acceptance and all write-approval and automation-mode conditions.');
      finding('workflow-native-stage-status-ported', 'warning', 'Stage persistence is verified by read-back and reported in conversation; native footer refresh is not assumed.');
    }

    if (/status line[\s\S]{0,100}(?:context|\d+%)|context[^\n]*(?:70%|usage)|\/compact\b|\/clear\b|session-state\/active\.md/i.test(text)) {
      text = text.replace(/check if the status line\s+shows context at or above (\d+)%\. If so,/gi, 'save the checkpoint. When trustworthy target telemetry is available and measures context at or above $1%,');
      text = text.replace(/check (?:the )?status line for context usage/gi, 'check trustworthy target context telemetry when available');
      text = explain(text, 'telemetry', telemetry);
      finding('workflow-context-telemetry-conditional', 'warning', 'Checkpoint/resume behavior is retained. Exact context percentages and automatic source triggers require actual target telemetry; no percentage may be invented.');
    }

    if (/CLAUDE(?:\.local)?\.md|\.claude\//.test(text)) {
      const paths = Object.entries(options.sourceToTarget || {}).sort(([a], [b]) => b.length - a.length);
      for (const [source, target] of paths) {
        if (!/CLAUDE(?:\.local)?\.md$|^\.claude\/.*\.md$/.test(source)) continue;
        const pattern = new RegExp('(?<![\\w/])@?' + escape(source) + '(?![\\w/])', 'g');
        text = text.replace(pattern, () => target);
      }
      text = text.replace(/Verify the ([^\n.]+\.md) import\./g, 'Verify that the mapped conventions in $1 were explicitly read and loaded.');
      text = explain(text, 'instructions', instructionLoading);
      finding('workflow-instructions-loading-ported', 'warning', 'Project conventions require explicit target-supported loading with preserved scope; source imports and glob activation are not assumed. Existing AGENTS.md must not be overwritten.');
      const mappedTargets = new Set(paths.map(([, target]) => target.replace(/^\.\//, '').replace(/\\/g, '/')));
      const unresolved = new Set<string>();
      let optionalLocal = false;
      let runtimeInput = false;
      const createsLocalProfile = /\bcopy this (?:file|template) to (?:your|the) project root as [`"']?CLAUDE\.local\.md/i.test(input);
      for (const match of text.matchAll(/@?(?:(?:[a-zA-Z0-9_.-]+\/)*CLAUDE(?:\.local)?\.md\b|(?:[a-zA-Z0-9_.-]+\/)*\.claude\/[a-zA-Z0-9_./-]+\.md\b)/g)) {
        const reference = match[0].replace(/^@/, '').replace(/^\.\//, '');
        if (mappedTargets.has(reference)) continue;
        if(options.projectPaths?.includes(reference)){runtimeInput=true;continue;}
        // A preserved target may contain a source directory name. It is resource
        // data, not a claim that the source harness will activate that directory.
        if (paths.some(([, target]) => target.replace(/\\/g, '/') === reference)) continue;
        const start = text.lastIndexOf('\n', match.index) + 1;
        const end = text.indexOf('\n', match.index + match[0].length);
        const line = text.slice(start, end < 0 ? text.length : end);
        if (/(?:^|\/)CLAUDE\.local\.md$/.test(reference) && (createsLocalProfile || /\b(?:if (?:present|exists|available|found)|when present|optional|if [^.!?\n]{0,80} exists)\b/i.test(line))) {
          optionalLocal = true;
          continue;
        }
        const optionalGuard = /\b(?:if (?:present|exists|available|found)|when present|optional|if [^.!?\n]{0,80} exists)\b/i.test(line);
        const configFallback = /\b(?:fallback|fall(?:s|ing)? back|legacy)\b/i.test(line)
          && /\b(?:engine|naming|performance|config(?:uration)?|keys?|values?|fields?|preferences|settings?|patterns?|libraries|specialists?)\b/i.test(line);
        const generatedOutput = /\b(?:create or update|creat(?:e|ing) (?:the |a |this )?(?:file|template)|write (?:it |them )?to|save (?:it |them )?to)\b/i.test(line);
        const templateDiscovery = /(?:^|\/)templates\//.test(reference) && /\b(?:glob|search|look|find) (?:for|up)\b/i.test(line);
        if (optionalGuard || configFallback || generatedOutput || templateDiscovery) { runtimeInput = true; continue; }
        unresolved.add(reference);
      }
      if (optionalLocal) text = explain(text, 'optional-local-instructions', optionalLocalInstructions);
      if (runtimeInput) text = explain(text, 'project-runtime-inputs', projectRuntimeInputs);
      if (unresolved.size) finding('workflow-instructions-map-needed', 'blocking', 'Project-instruction references need a verified resource or explicit project-runtime lookup before use: ' + [...unresolved].slice(0, 8).join(', ') + '. Preserve their original requirements.');
    }

    text = text.replace(/\bRead\(offset,\s*limit\)/g, 'a bounded file read (offset, limit)');
    text = text.replace(/`(Read|Glob|Grep|Write|Edit|Bash|WebSearch|WebFetch)`/g, (_match, name: string) => ({ Read: 'the available file reader', Glob: 'the available file search', Grep: 'the available content search', Write: 'the available file writer', Edit: 'the available precise file editor', Bash: 'the available shell', WebSearch: 'the available web search', WebFetch: 'the available page fetch' })[name]!);
    text = text.replace(/\b(?:Use|use|via) (Read|Glob|Grep|Write|Edit)\b/g, (match, name: string) => match.slice(0, match.length - name.length) + ({ Read: 'the available file reader', Glob: 'the available file search', Grep: 'the available content search', Write: 'the available file writer', Edit: 'the available precise file editor' })[name]);
    text = text.replace(/(?<![\w/.\\-])(?<!Git )Bash(?![\w/\\(-]|\.[a-zA-Z0-9])/g, 'the available shell')
      .replace(/(?<![\w/.\\-])WebSearch(?![\w/\\(-]|\.[a-zA-Z0-9])/g, 'the available web search')
      .replace(/(?<![\w/.\\-])WebFetch(?![\w/\\(-]|\.[a-zA-Z0-9])/g, 'the available page fetch');
    text = nativeRoutes(text);

    const positiveTechnicalClaims = original.replace(/\b(?:never|do not|don't|cannot|must not)\s+(?:claim|assume|guarantee|invent|pretend|establish|create)[^.;\n]*/gi, '');
    if (/\b(?:MUST|must|require[sd]?|guarantee)[^.\n]{0,160}(?:separate[^.\n]{0,30}sandbox|OS.level|filesystem isolation|network isolation)|\bhard (?:requirement|technical (?:control|guarantee))\b/i.test(positiveTechnicalClaims)) {
      finding('workflow-strict-runtime-control', 'blocking', 'A strict isolation/runtime guarantee remains unchanged and requires a verified technical implementation; prose adaptation cannot satisfy it.');
    }
    // A capitalized project/product name following the platform name is source
    // identity, not by itself a claim that the target has source-platform APIs.
    if (/\b(?:subagent_type|context:\s*fork|Claude Code(?!\s+[A-Z][a-z])|CLAUDE_CODE_[A-Z_]+|Task\s*\([^)]*subagent|Read\s*\(|Grep\s+pattern=)\b|\bBash\s*\(/.test(text)) {
      finding('workflow-unmapped-source-requirement', 'blocking', 'An active source-specific operation or platform requirement remains and needs semantic adaptation with its supporting context.');
    }
    return text;
  };

  // These complete, finite operational clauses have a known target procedure.
  // Match literal source text (or its exact mapped resource spelling), outside
  // surrounding fences/frontmatter. Unknown API fixtures/imports stay unmet.
  let instructionInput=input;
  const replaceActiveClause=(source:string,replacement:string,code:string,message:string):boolean=>{
    let pattern=escape(source);
    for(const path of ['CLAUDE.md','.claude/settings.local.json']){
      const target=options.sourceToTarget?.[path];
      if(target&&target!==path)pattern=pattern.replaceAll(escape(path),'(?:'+escape(path)+'|'+escape(target)+')');
    }
    const match=new RegExp(pattern.replace(/\n/g,'\\r?\\n'),'g');let changed=false;
    instructionInput=instructionInput.replace(match,(whole,offset:number)=>{
      if(!activeClauseAt(instructionInput,offset))return whole;
      changed=true;finding(code,'warning',message);return replacement;
    });
    return changed;
  };
  const engineWrite=replaceActiveClause(engineReferenceWriteClause,
    'Within the same Section 4 approved Technology Stack write, merge the required engine-reference loading instruction into `<project-root>/AGENTS.md` under the existing `ENGINE-REFERENCE-IMPORT` marker. Read the actual project AGENTS.md and its applicable scoped instructions first; preserve unrelated content and the original Section 4 confirmation. The instruction under that marker must require: "Before engine-dependent work, explicitly read and load `docs/engine-reference/<engine>/VERSION.md` from the selected project. If the configured reference is missing or unreadable, STOP dependent work and report the missing input." Set <engine> from the actual configured choice: Godot → `docs/engine-reference/godot/VERSION.md`; Unity → `docs/engine-reference/unity/VERSION.md`; Unreal → `docs/engine-reference/unreal/VERSION.md`. Do not write an @ import or promise automatic imports. Re-running setup for a different engine replaces only this marker-bound instruction within the authorized merge. Section 7 creates the selected reference directory and documents when absent; verify that reference exists and is loaded before dependent engine work. Section 8 only reads back this same instruction and does not authorize another edit.',
    'workflow-engine-reference-loading-ported','The known engine-reference import becomes one approved project AGENTS.md loading instruction, with the same marker, engine selection and Section 4 approval; Section 8 remains read-only.');
  if(engineWrite)replaceActiveClause('Read `CLAUDE.md` and show the user the proposed Technology Stack changes.','Read `<project-root>/AGENTS.md` and show the user the proposed Technology Stack changes.','workflow-engine-reference-loading-ported','The known engine setup reads the actual project instruction file before its approved merge.');
  replaceActiveClause(engineReferenceVerifyClause,
    '## 8. Verify the Project Engine-Reference Loading Instruction\n\n**The loading instruction was already written in Section 4 — do not edit it again and do not ask again.** This is a read-only verification of the same approved change. Read the actual `<project-root>/AGENTS.md` and find `ENGINE-REFERENCE-IMPORT` by its marker, never by a heading. Confirm that its required explicit read/load instruction names `docs/engine-reference/<engine>/VERSION.md` for the engine just configured, that the project reference exists and is readable, and that it is actually loaded before dependent engine work. Missing, unreadable or wrong-engine content is not a pass. If the instruction is absent or names a different engine, Section 4 did not complete: return to and finish Section 4 under its original approval contract rather than patching anything or opening a second approval prompt here. No source @ import or automatic target import is assumed.',
    'workflow-engine-reference-loading-ported','The known Section 8 import check verifies the actual project instruction and engine reference without another write or approval.');
  replaceActiveClause('This skill pre-approves `godot` on PATH. An engine run through `engine.path` or\nthe executable `commands.test` names asks first: the user approves it once, or\nadds `Bash(<that executable> *)` to `.claude/settings.local.json`.',
    'This document does not grant actual Codex session permission. Before an engine run, resolve `godot` on PATH, `engine.path` or the executable named by `commands.test` to the real intended binary and validate the selected project, working directory and literal argv; never interpolate project configuration or user arguments into executable shell text. Preserve the original `engine.path` and `commands.test` ask-first branch: obtain an actual user approval for that executable or verify an already valid approval in the supported target authorization system. Existing authorized `godot` use remains subject to actual session/tool permissions. A source permission pattern cannot authorize Codex and no source settings file should be edited as a substitute. If required permission, the executable or its runtime is unavailable, STOP the dependent run and report `Run result: NOT VERIFIED` with the reason; preserve the original visual gates and strictness settings.',
    'workflow-engine-permission-ported','Engine execution uses actual target permissions and literal argv; the original configured-executable ask-first branch remains required.');
  replaceActiveClause('The agent can see images: Claude Code\'s `Read` tool renders a PNG. The whole\nproblem is getting a picture out of the engine unattended, and every supported\nengine has a native way.',
    'Verify actual image-viewing capability in the current Codex session before claiming an observation. Capture and retain the real engine image using the applicable documented engine mechanism, then open and inspect that PNG with a supported image-viewing tool; a text-only read is insufficient. If image viewing is unavailable, the PNG is unreadable or no actual visual inspection occurred, report `Run result: NOT VERIFIED` with the reason and retain the original visual acceptance gates and explicit strictness exceptions. A generated capture or an engine exit alone does not establish what was observed.',
    'workflow-image-observation-ported','Visual evidence requires actual retained image inspection through a supported target viewer; unavailable viewing keeps NOT VERIFIED and original visual gates.');
  replaceActiveClause('4. **Look.** `Read` the PNG.','4. **Look.** Open and visually inspect the retained PNG with the actual supported image-viewing tool; if unavailable, record `Run result: NOT VERIFIED`.','workflow-image-observation-ported','Visual observation uses a supported image viewer rather than assuming a text reader displays PNGs.');
  replaceActiveClause('`MSYS_NO_PATHCONV=1` prefix is required on Windows:** Claude Code runs commands\nin Git Bash, which rewrites any argument beginning with `/` as a Windows path, so\n`/Game/Maps/Shop` reaches the engine as `C:/Program Files/Git/Game/Maps/Shop`\nand the game stops on a "map not found" dialog nobody can see.',
    '`MSYS_NO_PATHCONV=1` prefix is conditional:** identify the actual shell and runtime first. Apply the no-path-conversion workaround only when executing through actual MSYS/Git Bash with argument path conversion active, so the map URL reaches the engine unchanged. In native PowerShell or another non-MSYS runtime, invoke the intended executable with literal argv and that runtime\'s environment API; do not add MSYS-only syntax or assume the examples are portable command strings. Verify the engine received the selected map URL and project before claiming the launch succeeded.',
    'workflow-shell-runtime-ported','The known Unreal path-conversion workaround is conditional on an actual MSYS/Git Bash runtime; other target shells need literal argv and their own environment API.');
  replaceActiveClause('**The project path must be absolute** — with `MSYS_NO_PATHCONV` set, only\n`$(pwd -W 2>/dev/null || pwd)` gives one: a relative `Game.uproject` is not\nfound, and the launch waits on an error dialog forever (verified on 5.7).',
    '**The project path must be absolute.** Resolve and validate the actual selected project file with the current runtime\'s path API, preserve spaces as one literal argument, and fail if it is absent or unreadable. The `$(pwd -W 2>/dev/null || pwd)` example applies only to a verified compatible MSYS/Git Bash shell; it is not a universal Windows path API. Preserve the bounded launch and capture checks; an error dialog or a process exit without a retained inspected screenshot is not an observed run.',
    'workflow-shell-runtime-ported','The configured project is resolved to an actual absolute file using the current runtime, without assuming a Git Bash command works in all target shells.');
  replaceActiveClause(automationModeClause,
    automationModeClause.slice(4,-4).replaceAll('AskUserQuestion','the supported decision prompt')+'\n\n'+decision,
    'workflow-question-presentation-ported','The known operational mode pseudocode uses supported questions with the original mode branches, capped options, always-ask categories, decision logging and actual-answer consent.');
  const lines = instructionInput.split(/(?<=\n)/);
  const output: string[] = []; let prose = ''; let fence: { char: string; size: number } | undefined; let frontmatter = /^---\r?\n/.test(input); let frontmatterFirst = true;
  const flush = () => { if (prose) { output.push(port(prose)); prose = ''; } };
  for (const line of lines) {
    if (frontmatter) {
      output.push(line);
      if (!frontmatterFirst && /^---\s*$/.test(line.trimEnd())) frontmatter = false;
      frontmatterFirst = false;
      continue;
    }
    const marker = /^[ \t]*(`{3,}|~{3,})(.*)$/.exec(line.trimEnd());
    if (!fence && marker) { flush(); fence = { char: marker[1][0], size: marker[1].length }; output.push(line); continue; }
    if (fence) {
      output.push(line);
      if(instructionWrite(line))finding('workflow-project-write-review','blocking','An executable example writes a source instruction file or installed resource. Adapt it to the selected project with approved scoped merges; never write into the package/cache.');
      if (/\b(?:AskUserQuestion|TaskCreate|TaskGet|TaskList|TaskUpdate|TodoWrite|subagent_type)\b/.test(line)) {
        finding('workflow-source-api-example', 'blocking', 'A preserved fenced source-API example needs semantic review before it can be used as a target execution instruction; its code was not rewritten.');
      }
      if (/^\s*@\S+\.(?:md|markdown)\s*$/.test(line)) {
        finding('workflow-source-instruction-import', 'blocking', 'A preserved source import scaffold has no verified automatic target loading semantics; resolve explicit instructions loading before use.');
      }
      if (marker && marker[1][0] === fence.char && marker[1].length >= fence.size && !marker[2].trim()) fence = undefined;
      continue;
    }
    if (/^\s*!`/.test(line)) {
      flush(); output.push(line);
      finding('workflow-dynamic-preparation-needed', 'blocking', 'Dynamic source preprocessing remains for explicit runtime preparation through the script-resource adapter; it must not execute during conversion.');
      continue;
    }
    prose += line;
  }
  flush();
  const text=output.join(''),resources=installedResourceChecks(text,options);
  if(resources.writes.length||resources.staleReads.length)finding('workflow-installed-resource-write-review','blocking','The workflow mutates installed resources or retains live reads from an immutable resource that must evolve: '+[...new Set([...resources.writes,...resources.staleReads])].slice(0,8).join(', ')+'. Preserve the original consent gates and adapt the complete lifecycle to an explicit approved project-local fork: inspect an existing fork, seed only when appropriate from the read-only installed baseline, bind every subsequent live read and approved update to that same fork, and preserve backups, keep/revert and rollback. Installed package/cache paths must never be mutation targets. A generic read-only warning or moving only the write path is insufficient.');
  return { text, findings, semanticNeeded, installedWritePaths: resources.writes };
}
