import { expect, it } from 'vitest';
import { claudeSyntaxMarkers } from '../../src/core/adapters/skills';
import { activeSkillDetails, skillCalls } from '../../src/core/skill-calls';

const options = { sourcePath: '.claude/skills/author/references/section.md', targetPath: 'skills/author/references/section.md', skillCalls: { review: 'studio-review', author: 'studio-author', help: 'studio-help' } };
async function port(text: string, extra = {}) {
  const module = await import('../../src/core/workflow-portability').catch(() => undefined);
  expect(module?.adaptWorkflowText, 'the functional instruction porter must exist').toBeTypeOf('function');
  return module!.adaptWorkflowText(text, { ...options, ...extra });
}

const commitHookClaim = 'The `validate-commit.sh` hook blocks invalid data JSON and warns on hardcoded gameplay values and TODOs without an owner. It does not read the commit message: the story and design references go there from you.';
const mappedCommitRuntime = {
  sourceToTarget: { '.claude/hooks/validate-commit.sh': 'source-context/.claude/hooks/validate-commit.sh' },
  installedResourcePaths: ['source-context/.claude/hooks/validate-commit.sh', 'codex-compat/run-helper.py', 'codex-compat/scripts.json']
};
it('turns the actual commit-hook claim into a mapped explicit preflight with real stdin and stop conditions', async () => {
  const result = await port(commitHookClaim, mappedCommitRuntime);
  expect(result.semanticNeeded).toBe(false);
  expect(result.text).not.toContain('hook blocks invalid data JSON');
  expect(result.text).toContain('source-context/.claude/hooks/validate-commit.sh');
  expect(result.text).toContain('codex-compat/run-helper.py');
  expect(result.text).toContain('--project');
  expect(result.text).toContain('--script "source-context/.claude/hooks/validate-commit.sh"');
  expect(result.text).toMatch(/read[^\n]*helper[^\n]*(?:contract|protocol)/i);
  expect(result.text).toMatch(/tool_input\.command/);
  expect(result.text).toContain('{"tool_input":{"command":');
  expect(result.text).toMatch(/JSON[^\n]*stdin|stdin[^\n]*JSON/);
  expect(result.text).toMatch(/STOP[^\n]*git commit[^\n]*nonzero|nonzero[^\n]*STOP[^\n]*git commit/i);
  expect(result.text).toMatch(/(?:preserve|show)[^\n]*warning[^\n]*(?:stdout|stderr)|(?:stdout|stderr)[^\n]*warning/i);
  expect(result.text).toMatch(/(?:unsupported|not assumed|not registered)[^\n]*(?:hook|event)|(?:hook|event)[^\n]*(?:unsupported|not assumed|not registered)/i);
  expect(result.text).toContain('hardcoded gameplay values and TODOs without an owner');
  expect(result.text).toContain('It does not read the commit message: the story and design references go there from you.');
  expect(result.text).toMatch(/(?:protocol|contract)[^\n]*(?:cannot|unavailable|unknown|undetermined)[^\n]*STOP|STOP[^\n]*(?:protocol|contract)[^\n]*(?:cannot|unavailable|unknown|undetermined)/i);
  expect((await port(result.text, mappedCommitRuntime)).text).toBe(result.text);
});
it.each([
  {},
  { sourceToTarget: { 'one/validate-commit.sh': 'source-context/one/validate-commit.sh', 'two/validate-commit.sh': 'source-context/two/validate-commit.sh' } },
  { ...mappedCommitRuntime, installedResourcePaths: ['source-context/.claude/hooks/validate-commit.sh'] }
])('retains a blocking unresolved commit preflight when no unique executable route exists: %j', async extra => {
  const result = await port(commitHookClaim, extra);
  expect(result.semanticNeeded).toBe(true);
  expect(result.text).toContain('`validate-commit.sh` hook blocks invalid data JSON');
  expect(result.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'workflow-event-helper-route-unresolved', severity: 'blocking' })]));
});
it('replaces the actual automatic checkpoint-display claim with explicit resume reads without changing its schema', async () => {
  const input = 'After updating the story file, silently update the checkpoint in\n`production/session-state/active.md` — **overwrite the `<!-- CHECKPOINT -->` …\n`<!-- /CHECKPOINT -->` block, never append** (schema:\n`source-context/templates/session-state.md`). `session-start.sh` shows exactly\nthat block when the next session opens. Fill **Next step** from Phase 8, so it\nnames the same next story the user is shown:\n\n    <!-- CHECKPOINT -->\n    **Next step:** [/story-done next.md]\n    <!-- /CHECKPOINT -->\n\nIf `active.md` does not exist, create it from the template.';
  const result = await port(input);
  expect(result.semanticNeeded).toBe(false);
  expect(result.text).not.toMatch(/session-start\.sh` shows exactly\s+that block/);
  expect(result.text).toMatch(/(?:resume|next session)[^\n]*(?:explicitly read|read explicitly)/i);
  expect(result.text).toMatch(/actual[^\n]*CHECKPOINT/);
  expect(result.text).toMatch(/approved[^\n]*artifacts/);
  expect(result.text).toContain('**overwrite the `<!-- CHECKPOINT -->` …\n`<!-- /CHECKPOINT -->` block, never append**');
  expect(result.text).toContain('If `active.md` does not exist, create it from the template.');
  expect(result.text).toContain('    <!-- CHECKPOINT -->\n    **Next step:** [/story-done next.md]\n    <!-- /CHECKPOINT -->');
  expect((await port(result.text)).text).toBe(result.text);
});
it('reports the stage in conversation without promising a native footer refresh or weakening approval', async () => {
  const input = '**When a gate passes** (or the user explicitly accepts a CONCERNS verdict\'s risks — Section 6), update the stage in both `project.yaml` AND `production/stage.txt`. Dual-write keeps backward compatibility with hooks that haven\'t migrated yet. This updates the status line immediately.\nSay: "I\'ve set `project.stage` to `[stage]` (and updated `production/stage.txt`) — this anchors your status line and stage detection."';
  const result = await port(input);
  expect(result.semanticNeeded).toBe(false);
  expect(result.text).not.toMatch(/updates the status line immediately|anchors your status line/);
  expect(result.text).toMatch(/(?:read.back|verify)[^\n]*(?:stage|project\.yaml)/i);
  expect(result.text).toMatch(/(?:stage|status)[^\n]*conversation|conversation[^\n]*(?:stage|status)/i);
  expect(result.text).toContain('user explicitly accepts a CONCERNS verdict\'s risks');
  expect(result.text).toContain('`project.yaml` AND `production/stage.txt`');
  expect(result.text).toMatch(/native[^\n]*(?:footer|status)[^\n]*(?:not|unavailable|unsupported)|(?:not|unavailable|unsupported)[^\n]*native[^\n]*(?:footer|status)/i);
  expect((await port(result.text)).text).toBe(result.text);
});
it('leaves source programs and fenced event fixture data byte-for-byte unchanged', async () => {
  const input = '```json\n{"claim":"The `validate-commit.sh` hook blocks invalid data JSON"}\n```\n```sh\n# `session-start.sh` shows exactly that block when the next session opens.\nprintf "This updates the status line immediately."\n```';
  expect((await port(input, mappedCommitRuntime)).text).toBe(input);
  const module = await import('../../src/core/workflow-portability');
  expect(module.adaptWorkflowText(commitHookClaim, { ...options, ...mappedCommitRuntime, sourcePath: '.claude/hooks/program.sh' }).text).toBe(commitHookClaim);
});
it.each(['Opus', 'session (inherit)'])('retains a role/domain header while treating model tier %s as source provenance', async tier => {
  const input = '**Agent:** creative-director | **Model tier:** ' + tier + ' | **Domain:** Creative vision\nContext: only approved project artifacts.\nVerdict: FAIL remains blocking.';
  const result = await port(input);
  expect(result.semanticNeeded).toBe(false);
  expect(result.text).not.toContain('**Model tier:**');
  expect(result.text).toContain('**Agent:** creative-director');
  expect(result.text).toContain('**Domain:** Creative vision');
  expect(result.text).toContain(tier);
  expect(result.text).toMatch(/(?:source|provenance)[^\n]*(?:tier|preference)|(?:tier|preference)[^\n]*(?:source|provenance)/i);
  expect(result.text).toMatch(/selected[^\n]*Codex[^\n]*model|selected[^\n]*model[^\n]*Codex/i);
  expect(result.text).toContain('Context: only approved project artifacts.\nVerdict: FAIL remains blocking.');
  expect((await port(result.text)).text).toBe(result.text);
});
it('ports the actual engine child-delegation availability explanation and preserves its allowed list and fallback', async () => {
  const input = 'You have the `Agent` tool to delegate to your sub-specialists. Start only the\nfour below: this is Coordination Rule #1 (Vertical Delegation), and keeping to\nit is up to you, because when you run as a subagent Claude Code lets the `Agent`\ntool start any agent. If you have no `Agent` tool (Claude Code withholds it at\nits subagent depth limit), do the work yourself or name the sub-specialist in\nyour report so your caller can start it. Use it when a task requires deep expertise in a specific Godot subsystem:\n\n- `subagent_type: godot-gdscript-specialist` — GDScript architecture\n- `subagent_type: godot-csharp-specialist` — .NET patterns';
  const result = await port(input);
  expect(result.semanticNeeded).toBe(false);
  expect(result.text).not.toMatch(/Claude Code|subagent depth limit|You have the/);
  expect(result.text).toMatch(/(?:verify|check)[^\n]*(?:actual|available)[^\n]*delegation|delegation[^\n]*(?:availability|available)/i);
  expect(result.text).toContain('Start only the\nfour below: this is Coordination Rule #1 (Vertical Delegation)');
  expect(result.text).toMatch(/do the work yourself or name the sub-specialist in\s+your report so your caller can start it/);
  expect(result.text).toContain('godot-gdscript-specialist');
  expect(result.text).toContain('godot-csharp-specialist');
  expect((await port(result.text)).text).toBe(result.text);
});
it.each([
  'May I update `source-context/CCGS Skill Testing Framework/catalog.yaml`? If yes, update the entry.',
  'Update the skill entry in `source-context/CCGS Skill Testing Framework/catalog.yaml` after approval.',
  'Edit existing `source-context/catalog.yaml` after approval.',
  'Update both `source-context/catalog.yaml` and `codex-compat/scripts.json` after approval.',
  'Remove the stale entry from `source-context/catalog.yaml` after approval.',
  'Read `source-context/catalog.yaml`, then update it after approval.',
  '`source-context/catalog.yaml` must be updated after approval.',
  'The approved registry is written to `source-context/catalog.yaml`.',
  'The approved registry is written in `source-context/catalog.yaml`.',
  'Update schema: `source-context/catalog.yaml`.',
  'Run `cp approved.yaml source-context/catalog.yaml`.',
  'Run `cp source-context/catalog.yaml source-context/catalog.yaml`.',
  'Run `cp source-context/catalog.yaml backup.yaml`; then update `source-context/catalog.yaml` after approval.',
  '```sh\nprintf ready > "${C2C_RESOURCE_ROOT}/source-context/catalog.yaml"\n```',
  '```sh\n> "source-context/catalog.yaml"\n```',
  '```sh\nsed -i "s/old/new/" "source-context/catalog.yaml"\n```',
  '```sh\ncp approved.yaml "source-context/catalog.yaml"\n```',
  '```sh\nmv "source-context/catalog.yaml" archived.yaml\n```',
  'Write the approved registry to `codex-compat/scripts.json`.'
])('blocks active mutation of an installed resource: %s', async text => {
  const result = await port(text);
  expect(result.semanticNeeded).toBe(true);
  expect(result.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'workflow-installed-resource-write-review', severity: 'blocking' })]));
});
it('blocks writes to known installed resource mappings outside source-context', async () => {
  const result = await port('Update `resources/catalog.yaml` after approval.', { sourceToTarget: { 'catalog.yaml': 'resources/catalog.yaml' } });
  expect(result.semanticNeeded).toBe(true);
  expect(result.findings.some(f => f.code === 'workflow-installed-resource-write-review')).toBe(true);
});
it('resolves URI-escaped linked package paths with spaces and Unicode before checking writes', async () => {
  const result = await port('If approved, update [the catalog](../../../Test/cat%C3%A1logo%20real.yaml).', { installedResourcePaths: ['Test/catálogo real.yaml'] });
  expect(result.semanticNeeded).toBe(true);
  expect(result.installedWritePaths).toEqual(['Test/catálogo real.yaml']);
  expect(result.text).toBe('If approved, update [the catalog](../../../Test/cat%C3%A1logo%20real.yaml).');
});
it.each([
  'Read [the catalog](../../../Test/cat%C3%A1logo%20real.yaml) only as the immutable baseline seed.',
  'Do not update [the catalog](../../../Test/cat%C3%A1logo%20real.yaml); keep it as evidence.'
])('preserves explicitly immutable linked baseline use: %s', async text => {
  const result = await port(text, { installedResourcePaths: ['Test/catálogo real.yaml'], requiredMutableResources: ['Test/catálogo real.yaml'] });
  expect(result.semanticNeeded).toBe(false);
  expect(result.text).toBe(text);
});
it.each([
  'Every file write follows `source-context/docs/automation-modes.md`.',
  'Writes must conform to `source-context/policy.md` before any project edit.',
  '> Both emitters write this field inside a blockquote — `source-context/template.md` and the design workflow produce the same field.',
  '> `source-context/standards.md` documents the required evidence.',
  '> `${C2C_RESOURCE_ROOT}/source-context/helper.sh` picks the prior review.',
  'Append each approved deviation to `<project-root>/debt.md` — the format under "Debt Register Format" in `skills/debt/SKILL.md`.',
  'Read `source-context/catalog.yaml` for the baseline schema.',
  'The verification result says what was run against the written code (Godot: `source-context/scripts/check.gd` over the changed scripts).',
  'append** (schema: `source-context/templates/session-state.md`).',
  "Write every bug in `$bug-report`'s template (`skills/bug-report/SKILL.md`, section Report).",
  '1. Copy this template to your project root: `cp source-context/templates/local.md local-preferences.md`',
  '- [ ] Nothing is written in the specialist\'s place — the protocol\'s option is "skip this contributor and note the gap" (`source-context/docs/recovery.md`), not substitute lore.',
  'Do not update `source-context/catalog.yaml`; read it only as evidence.',
  'Never write to `source-context/catalog.yaml` or modify `codex-compat/scripts.json`.',
  '> Historical example, do not execute:\n> "Update `source-context/catalog.yaml` after approval."',
  '```sh\ncp "source-context/catalog.yaml" "<project-root>/catalog.yaml"\n```'
])('preserves installed baseline reads and explicit prohibitions or quoted history: %s', async text => {
  const result = await port(text);
  expect(result.semanticNeeded).toBe(false);
  expect(result.findings.some(f => f.code === 'workflow-installed-resource-write-review')).toBe(false);
  expect(result.text).toBe(text);
});
it('rejects a project fork that retains stale live reads from the installed catalog', async () => {
  const result = await port('Read `source-context/catalog.yaml` for the current category. After approval update `<project-root>/testing/catalog.yaml`.', { requiredMutableResources: ['source-context/catalog.yaml'] });
  expect(result.semanticNeeded).toBe(true);
  expect(result.findings.some(f => f.code === 'workflow-installed-resource-write-review')).toBe(true);
});
it.each([
  'After writing, run `python "${C2C_RESOURCE_ROOT}/codex-compat/run-helper.py" --project "${C2C_PROJECT_ROOT}" --script "source-context/.claude/scripts/registry.sh" -- validate` and fix every row about an entry this write added.',
  'Before writing, run `python "${C2C_RESOURCE_ROOT}/codex-compat/run-helper.py" --project "${C2C_PROJECT_ROOT}" --script "source-context/.claude/scripts/write-guard.sh" -- overwrite\n  "design/gdd/system.md"`.',
  '- **Save them:** run `python "${C2C_RESOURCE_ROOT}/codex-compat/run-helper.py" --project "${C2C_PROJECT_ROOT}" --script "source-context/.claude/scripts/set-stage.sh" -- "[stage]"`, then check the read-back rows.',
  'The pick is the consent to write it: run `python "${C2C_RESOURCE_ROOT}/codex-compat/run-helper.py" --project "${C2C_PROJECT_ROOT}" --script "source-context/.claude/scripts/config-set.sh" -- modes.automation [value]`.',
  'After updating the project, execute `python3 codex-compat/run-helper.py --project "<project-root>" --script source-context/check.sh --`.',
  'After saving the project, invoke `py -3 "codex-compat/run-helper.py" --project "<project-root>" --script="source-context/check.sh" --`.'
])('recognizes the immutable executable and --script inputs of a project helper invocation: %s', async text => {
  const result = await port(text);
  expect(result.installedWritePaths).toEqual([]);
  expect(result.findings.some(f => f.code === 'workflow-installed-resource-write-review')).toBe(false);
  expect(result.text).toContain(text);
});
it.each([
  'Update `codex-compat/run-helper.py` after approval.',
  'Edit `source-context/check.sh` before invoking it.',
  'Run `python codex-compat/run-helper.py --project "<project-root>" --script source-context/check.sh --`; then update `source-context/check.sh`.',
  'Update `source-context/check.sh`; then run `python codex-compat/run-helper.py --project "<project-root>" --script source-context/check.sh --`.',
  'Run `python codex-compat/run-helper.py --script source-context/check.sh --` and modify it after approval.',
  'After writing, run `python codex-compat/run-helper.py --script source-context/check.sh -- > codex-compat/run-helper.py`.',
  'After writing, run `python codex-compat/run-helper.py --script source-context/check.sh -- >> source-context/check.sh`.',
  'After writing, run `python codex-compat/run-helper.py --script source-context/check.sh -- update source-context/catalog.yaml`.',
  'After writing, run `python codex-compat/run-helper.py --script source-context/check.sh -- update --script source-context/catalog.yaml`.'
])('still blocks mutation targets that accompany an immutable helper invocation: %s', async text => {
  const result = await port(text);
  expect(result.findings.some(f => f.code === 'workflow-installed-resource-write-review')).toBe(true);
});
it('accepts a seeded project-local catalog with all live operations and rollback bound to that fork', async () => {
  const text = 'Read `source-context/catalog.yaml` only as the immutable baseline seed. Ask whether to create `<project-root>/testing/catalog.yaml`; if approved, copy the baseline there without overwriting an existing fork. Read current category and scores from `<project-root>/testing/catalog.yaml` in every subsequent phase. Show the exact changes and update only approved entries in `<project-root>/testing/catalog.yaml`. Back up the fork before editing; if rejected, restore its exact pre-edit content after the original rollback consent.';
  const result = await port(text, { requiredMutableResources: ['source-context/catalog.yaml'] });
  expect(result.semanticNeeded).toBe(false);
  expect(result.text).toBe(text);
  expect((await port(result.text, { requiredMutableResources: ['source-context/catalog.yaml'] })).text).toBe(text);
});
it('resolves declared live project inputs at use without substituting bundled defaults',async()=>{
 const result=await port('Read `.claude/docs/preferences.md` before writing. It supplies the selected project values.',{projectPaths:['.claude/docs/preferences.md']});
 expect(result.findings.some(f=>f.severity==='blocking')).toBe(false);
 expect(result.text).toContain('.claude/docs/preferences.md');
 expect(result.text).toMatch(/selected project|actual project/);
 expect(result.text).toMatch(/required.*(?:missing|unavailable)|(?:missing|unavailable).*required/);
 const missing=await port('Read `.claude/docs/unresolved.md` before writing.',{projectPaths:['.claude/docs/preferences.md']});
 expect(missing.semanticNeeded).toBe(true);
});
it('lê o argumento completo da invocação preservando gramática e não altera variáveis de programas',async()=>{
 const result=await port('**Focus:** `$ARGUMENTS` (blank = `full`). Preserve spaces in the feature name.\n```sh\necho "$ARGUMENTS"\n```');
 expect(result.text).toContain('complete argument text');
 expect(result.text).toContain('(blank = `full`)');
 expect(result.text).toContain('echo "$ARGUMENTS"');
 expect(result.text).toMatch(/not.*(?:shell|environment)|never.*(?:shell|environment)/i);
});

it('replaces active widget-only approval instructions while preserving the actual consent contract', async () => {
  const result = await port('In collaborative mode: show the draft, then use `AskUserQuestion`. **NEVER use plain text. NEVER skip this step.**\nThe draft and the approval widget MUST appear together in one response.\nApprove the section? Approve / Make changes / Start over.\nNever write a section without user approval.');
  expect(result.text).not.toMatch(/AskUserQuestion|NEVER use plain text|approval widget MUST/);
  expect(result.text).toMatch(/actual (?:user )?(?:answer|reply)/i);
  expect(result.text).toMatch(/(?:skipped|dismissed).*not.*(?:approval|consent)/i);
  expect(result.text).toContain('Approve / Make changes / Start over');
  expect(result.text).toContain('Never write a section without user approval.');
  expect(result.text).toMatch(/same (?:response|message)|together/i);
  expect(result.findings.some(f => f.severity === 'blocking')).toBe(false);
});

it('does not replace configured autonomy with new universal write approvals', async () => {
  const result = await port('In autonomous mode, do not call AskUserQuestion except automation_always_ask. Log every decision. Guided mode writes approved sections immediately.');
  expect(result.text).toContain('except automation_always_ask');
  expect(result.text).toContain('Guided mode writes approved sections immediately.');
  expect(result.text).toMatch(/required.*(?:gate|approval)|where.*required/i);
  expect(result.text).not.toMatch(/every file write always requires/i);
});

it('retains actual independent delegation and a fresh-chat fallback without claiming sandbox isolation', async () => {
  const result = await port('MANDATORY: spawn game-designer via the Agent tool in its own context window. Do NOT simulate specialist perspectives internally. Review /review in a fresh Claude Code session. Agents do NOT write files directly.');
  expect(result.text).toMatch(/actual.*(?:subagent|delegation)/i);
  expect(result.text).toMatch(/fresh.*(?:chat|session)/i);
  expect(result.text).toMatch(/(?:unavailable|unsupported).*(?:stop|hand.off)|(?:stop|hand.off).*(?:unavailable|unsupported)/i);
  expect(result.text).toContain('$studio-review');
  expect(result.text).toContain('Do NOT simulate specialist perspectives internally.');
  expect(result.text).toContain('Agents do NOT write files directly.');
  expect(result.text).toMatch(/(?:no|not|does not).*sandbox/i);
});

it('does not downgrade a hard sandbox guarantee into an instructional suggestion', async () => {
  const result = await port('The reviewer MUST have a separate read-only sandbox and must never access network credentials.');
  expect(result.text).toContain('MUST have a separate read-only sandbox');
  expect(result.text).toContain('must never access network credentials');
  expect(result.semanticNeeded).toBe(true);
  expect(result.findings.some(f => f.severity === 'blocking')).toBe(true);
});

it('converts progress operations to recoverable state rather than pretending they are delegation', async () => {
  const result = await port('Use TaskCreate, TaskGet, TaskList and TaskUpdate after each approved section.');
  expect(result.text).not.toMatch(/TaskCreate|TaskGet|TaskList|TaskUpdate/);
  expect(result.text).toMatch(/stable.*(?:ID|identifier)/i);
  expect(result.text).toMatch(/(?:status|state).*dependenc/i);
  expect(result.text).toMatch(/(?:persist|recover|checkpoint)/i);
  expect(result.text).not.toMatch(/spawn|subagent/i);
});

it('retains recovery and a measured threshold without inventing telemetry', async () => {
  const result = await port('After writing each section, check if the status line\nshows context at or above 70%. If so, append this notice to the response:\n> Context is approaching the limit (≥70%). Progress is in `design/gdd/combat.md`.\nOpen a fresh Claude Code session and run `/author combat`.');
  expect(result.text).not.toMatch(/check if the status line\s+shows/i);
  expect(result.text).toMatch(/trustworthy|reliable/i);
  expect(result.text).toMatch(/(?:unavailable|cannot).*percentage|percentage.*(?:unavailable|not invent)/i);
  expect(result.text).toMatch(/checkpoint/i);
  expect(result.text).toContain('design/gdd/combat.md');
  expect(result.text).toContain('$studio-author combat');
});

it('resolves only registered workflow calls and preserves arguments, paths, HTTP and inert executable examples', async () => {
  const input = 'Run `/review design/gdd/combat.md --full`, then /help.\nGET /help HTTP/1.1\nFile `/help/config.json`; https://example.test/help.\n```sh\nprintf "/review"\n```\nUse /unknown-workflow if configured.';
  const result = await port(input);
  expect(result.text).toContain('`$studio-review design/gdd/combat.md --full`');
  expect(result.text).toContain('then $studio-help.');
  expect(result.text).toContain('GET /help HTTP/1.1');
  expect(result.text).toContain('`/help/config.json`');
  expect(result.text).toContain('https://example.test/help');
  expect(result.text).toContain('printf "/review"');
  expect(result.text).toContain('/unknown-workflow');
  expect(result.semanticNeeded).toBe(true);
});

it('keeps source command interpolation and frontmatter for their own adapters', async () => {
  const input = '---\nname: author\nallowed-tools: Read, Write, Agent\n---\n!`bash "${CLAUDE_SKILL_DIR}/../../hooks/yaml-helper.sh" resolve_config`\nRead(offset, limit) the target; use Grep to find the section and Edit the unique match.';
  const result = await port(input);
  expect(result.text).toContain('allowed-tools: Read, Write, Agent');
  expect(result.text).toContain('!`bash "${CLAUDE_SKILL_DIR}/../../hooks/yaml-helper.sh" resolve_config`');
  expect(result.text).not.toContain('Read(offset, limit)');
  expect(result.text).toMatch(/bounded.*read|read.*bounded/i);
  expect(result.text).toContain('unique match');
  expect(result.semanticNeeded).toBe(true);
});

it('loads mapped conventions explicitly without promising automatic imports or replacing project policies', async () => {
  const result = await port('Update CLAUDE.md Technology Stack. Verify the CLAUDE.md import. Read @.claude/docs/coding-standards.md before writing code.', { sourceToTarget: { 'CLAUDE.md': 'resources/source-project.md', '.claude/docs/coding-standards.md': 'resources/docs/coding-standards.md' } });
  expect(result.text).not.toContain('CLAUDE.md');
  expect(result.text).toContain('resources/source-project.md');
  expect(result.text).toContain('resources/docs/coding-standards.md');
  expect(result.text).toMatch(/explicitly.*(?:read|load)|(?:read|load).*explicitly/i);
  expect(result.text).toMatch(/(?:never|do not).*overwrit.*AGENTS\.md/i);
  expect(result.text).toMatch(/(?:not|no).*automatic.*import|import.*(?:not|no).*automatic/i);
});

it('ports self-test schema assertions while keeping substantive verdicts and behavioral assertions', async () => {
  const result = await port('### Check 1 — Required Frontmatter Fields\nThe file must contain all of these in the YAML frontmatter block:\n- `name:`\n- `description:`\n- `allowed-tools:`\n- `model:`\n### Check 2 — Collaborative Protocol\nNever write without approval. Missing files are NOT ASSESSED; malformed frontmatter is NON-COMPLIANT.');
  expect(result.text).not.toMatch(/^- `(?:allowed-tools|model):`/m);
  expect(result.text).toMatch(/supported Codex.*(?:metadata|schema)/i);
  expect(result.text).toMatch(/invocation policy/i);
  expect(result.text).toContain('Never write without approval.');
  expect(result.text).toContain('Missing files are NOT ASSESSED; malformed frontmatter is NON-COMPLIANT.');
});

it('does not apply Markdown instruction conversions to source code or JSON', async () => {
  const input = 'const prompt = "AskUserQuestion /review CLAUDE.md";';
  for (const sourcePath of ['scripts/generate.ts', 'assets/data.json', 'assets/logo.svg']) {
    const result = await port(input, { sourcePath, targetPath: sourcePath });
    expect(result.text).toBe(input);
    expect(result.findings).toEqual([]);
  }
});

it('keeps unfamiliar strict source controls visible for semantic analysis', async () => {
  const result = await port('Always use the vendor quantum-isolated prompt channel; this is a hard requirement.');
  expect(result.text).toContain('quantum-isolated');
  expect(result.semanticNeeded).toBe(true);
  expect(result.findings.some(f => f.severity === 'blocking')).toBe(true);
});

it('produces instructions that the existing source-syntax validator and installed-skill discovery can consume', async () => {
  const result = await port('Use `Read` and `Grep` on the target. Use `AskUserQuestion` to approve the draft. Never write without user approval. Run `/review target.md` in a fresh Claude Code session.');
  expect(claudeSyntaxMarkers(result.text)).toEqual([]);
  const files = [
    { path: 'skills/author/SKILL.md', data: Buffer.from('---\nname: studio-author\ndescription: Author one document\n---\n' + result.text) },
    { path: 'skills/review/SKILL.md', data: Buffer.from('---\nname: studio-review\ndescription: Independently review a document\n---\nReview the actual saved document.') },
    { path: 'skills/review/agents/openai.yaml', data: Buffer.from('policy:\n  allow_implicit_invocation: false\n') }
  ];
  const calls = skillCalls(files);
  expect(calls).toContain('$studio-review');
  expect(result.text).toContain(calls.find(call => call === '$studio-review'));
  expect(activeSkillDetails(files).find(skill => skill.name === 'studio-review')?.manualOnly).toBe(true);
});

it('preserves fenced API examples but flags their unported execution contract for semantic review', async () => {
  const input = 'Invoke this question tool:\n```json\n{"tool":"AskUserQuestion","options":["Approve","Revise"]}\n```\nWait for a real answer.';
  const result = await port(input);
  expect(result.text).toContain('{"tool":"AskUserQuestion","options":["Approve","Revise"]}');
  expect(result.semanticNeeded).toBe(true);
  expect(result.findings.some(f => f.code === 'workflow-source-api-example')).toBe(true);
});

it('preserves command-policy syntax and data paths instead of manufacturing executable tool aliases', async () => {
  const input = 'The source grant is `Bash(git log *)`. Read `assets/Bash/logo.svg` and `references/WebSearch.md`. Run the approved command via Bash.';
  const result = await port(input);
  expect(result.text).toContain('`Bash(git log *)`');
  expect(result.text).toContain('assets/Bash/logo.svg');
  expect(result.text).toContain('references/WebSearch.md');
  expect(result.text).toContain('via the available shell');
  expect(result.semanticNeeded).toBe(true);
});

it('keeps a source import scaffold unmet until a target loading route is actually resolved', async () => {
  const result = await port('Verify the CLAUDE.md import.\n```markdown\n@docs/engine-reference/<engine>/VERSION.md\n```', { sourceToTarget: { 'CLAUDE.md': 'resources/project-instructions.md' } });
  expect(result.text).toContain('@docs/engine-reference/<engine>/VERSION.md');
  expect(result.semanticNeeded).toBe(true);
  expect(result.findings.some(f => f.code === 'workflow-source-instruction-import')).toBe(true);
});

const engineReferenceWrite = [
  'In the same CLAUDE.md write, set the **Engine Version Reference** import to the',
  'chosen engine. Find the line marked `ENGINE-REFERENCE-IMPORT` (an',
  '`@docs/engine-reference/<engine>/VERSION.md` line under its comment) and Edit it',
  'to point at the configured engine:',
  '- Godot → `@docs/engine-reference/godot/VERSION.md`',
  '- Unity → `@docs/engine-reference/unity/VERSION.md`',
  '- Unreal → `@docs/engine-reference/unreal/VERSION.md`', '',
  'This keeps a Unity or Unreal project from loading the Godot reference in every',
  'session. It is idempotent — re-running `/setup-engine` for a different',
  'engine rewrites the same line. (The target `docs/engine-reference/<engine>/`',
  'directory is created in Section 7, Populate Engine Reference Docs, if it does not yet exist.)'
].join('\n');
const engineReferenceVerify = [
  '## 8. Verify the CLAUDE.md Import', '',
  '**This import was already written in Section 4 — do not edit it again and do not',
  'ask again.** Section 4 sets it as part of the same CLAUDE.md write, anchored to',
  'the `ENGINE-REFERENCE-IMPORT` marker. This step only confirms the result.', '',
  'Read `CLAUDE.md` and confirm the line under the marker reads:', '',
  '```markdown', '@docs/engine-reference/<engine>/VERSION.md', '```', '',
  'with `<engine>` the engine just configured. If it still points at a different',
  'engine, Section 4 did not complete — go back and finish it rather than patching',
  'the line here.', '',
  '> **Why this is a check and not a second write.** Repeating the edit here with',
  '> its own approval prompt would ask the user twice for one change, and the second',
  '> ask would be for work already done. Locate the line by its marker, never by the',
  '> `## Engine Version Reference` heading — the marker exists precisely so the line',
  '> can still be found when the heading moves or is reworded.'
].join('\n');
it.each(['CLAUDE.md', 'source-context/CLAUDE.md'])('ports the finite engine-reference write and verification pair from %s to one approved project instruction merge', async source => {
  const input=('Read `CLAUDE.md` and show the user the proposed Technology Stack changes.\nAsk: "May I write these engine settings to `CLAUDE.md`?"\nWait for confirmation before making any edits.\n\n'+engineReferenceWrite).replaceAll('CLAUDE.md',source);
  const extra={skillCalls:{'setup-engine':'setup-engine'},sourceToTarget:{'CLAUDE.md':source}};
  const write=await port(input,extra);
  expect(write.semanticNeeded).toBe(false);
  expect(write.text).toContain('Read `<project-root>/AGENTS.md` and show the user');
  expect(write.text).toContain('Wait for confirmation before making any edits.');
  expect(write.text).toContain('ENGINE-REFERENCE-IMPORT');
  expect(write.text).toContain('same Section 4');
  expect(write.text).toMatch(/explicitly read and load[^\n]*docs\/engine-reference\/<engine>\/VERSION\.md/);
  for(const engine of ['godot','unity','unreal'])expect(write.text).toContain('docs/engine-reference/'+engine+'/VERSION.md');
  expect(write.text).not.toMatch(/@docs\/engine-reference/);
  expect(write.text).toMatch(/(?:missing|unreadable)[^\n]*STOP|STOP[^\n]*(?:missing|unreadable)/i);
  const verify=await port(engineReferenceVerify.replaceAll('CLAUDE.md',source),extra);
  expect(verify.semanticNeeded).toBe(false);
  expect(verify.text).toContain('ENGINE-REFERENCE-IMPORT');
  expect(verify.text).toMatch(/read.only/i);
  expect(verify.text).toContain('do not edit it again and do not ask again');
  expect(verify.text).toContain('<project-root>/AGENTS.md');
  expect(verify.text).toMatch(/Section 4[^\n]*(?:finish|complete)|(?:finish|complete)[^\n]*Section 4/);
  expect(verify.text).not.toContain('@docs/');
  expect((await port(write.text)).text).toBe(write.text);
  expect((await port(verify.text)).text).toBe(verify.text);
});
it('retains unknown engine import variants and fenced copies as unmet source requirements',async()=>{
  const unknown=await port(engineReferenceVerify.replace('ENGINE-REFERENCE-IMPORT','OTHER-IMPORT'));
  expect(unknown.semanticNeeded).toBe(true);
  expect(unknown.text).toContain('@docs/engine-reference/<engine>/VERSION.md');
  const inert='````text\n'+engineReferenceVerify+'\n````';
  expect((await port(inert)).text).toBe(inert);
});
it('uses actual engine permission while preserving the source ask-first branch',async()=>{
  const input='This skill pre-approves `godot` on PATH. An engine run through `engine.path` or\nthe executable `commands.test` names asks first: the user approves it once, or\nadds `Bash(<that executable> *)` to `.claude/settings.local.json`.';
  const result=await port(input);
  expect(result.semanticNeeded).toBe(false);
  expect(result.text).not.toMatch(/pre-approves|Bash\(|settings\.local\.json/);
  expect(result.text).toMatch(/actual[^\n]*(?:Codex|session)[^\n]*permission/i);
  expect(result.text).toMatch(/literal[^\n]*argv/i);
  expect(result.text).toMatch(/engine\.path[^\n]*commands\.test[^\n]*ask.first/i);
  expect(result.text).toMatch(/actual[^\n]*(?:reply|approval)/i);
  expect((await port(result.text)).text).toBe(result.text);
});
it('requires actual image inspection and retains NOT VERIFIED if image viewing is unavailable',async()=>{
  const input='The agent can see images: Claude Code\'s `Read` tool renders a PNG. The whole\nproblem is getting a picture out of the engine unattended, and every supported\nengine has a native way.\n\n4. **Look.** `Read` the PNG. Compare what is on screen to the acceptance\ncriteria. Clipped text remains a defect.';
  const result=await port(input);
  expect(result.semanticNeeded).toBe(false);
  expect(result.text).not.toMatch(/Claude Code|file reader/);
  expect(result.text).toMatch(/actual[^\n]*image.viewing/i);
  expect(result.text).toContain('Run result: NOT VERIFIED');
  expect(result.text).toContain('Compare what is on screen to the acceptance\ncriteria. Clipped text remains a defect.');
  expect(result.text).toMatch(/text.only[^\n]*(?:insufficient|not)/i);
  expect((await port(result.text)).text).toBe(result.text);
});
it('conditions the known Unreal MSYS workaround on the real shell and resolves absolute paths in that runtime',async()=>{
  const input='`MSYS_NO_PATHCONV=1` prefix is required on Windows:** Claude Code runs commands\nin Git Bash, which rewrites any argument beginning with `/` as a Windows path, so\n`/Game/Maps/Shop` reaches the engine as `C:/Program Files/Git/Game/Maps/Shop`\nand the game stops on a "map not found" dialog nobody can see. Alternatively\npass the map through `-ExecCmds="open /Game/Maps/Shop"`, which is not converted.\n**The project path must be absolute** — with `MSYS_NO_PATHCONV` set, only\n`$(pwd -W 2>/dev/null || pwd)` gives one: a relative `Game.uproject` is not\nfound, and the launch waits on an error dialog forever (verified on 5.7).';
  const result=await port(input);
  expect(result.semanticNeeded).toBe(false);
  expect(result.text).not.toContain('Claude Code');
  expect(result.text).toMatch(/only[^\n]*actual MSYS\/Git Bash/i);
  expect(result.text).toMatch(/PowerShell[^\n]*(?:literal|argv)/i);
  expect(result.text).toMatch(/absolute[^\n]*project[^\n]*(?:path|file)|absolute[^\n]*(?:path|file)[^\n]*project/i);
  expect(result.text).not.toMatch(/only\s*`\$\(pwd/);
  expect(result.text).toContain('-ExecCmds="open /Game/Maps/Shop"');
  expect((await port(result.text)).text).toBe(result.text);
});
const automationPattern=[
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
it('ports only the known mode pseudocode and retains modes, choices, logging and no-answer consent',async()=>{
  const result=await port(automationPattern);
  expect(result.semanticNeeded).toBe(false);
  expect(result.text).not.toContain('AskUserQuestion');
  expect(result.text).toContain('guided + minor:          State recommendation inline, proceed.');
  expect(result.text).toContain('autonomous + other:      Pick recommended, log via log_decision, proceed.');
  expect(result.text).toContain('capped options + recommendation');
  expect(result.text).toContain('scope_changes, file_deletions, schema_changes');
  expect(result.text).toContain('architecture_decisions, version_bumps, external_calls');
  expect(result.text).toContain('skipped, dismissed or empty');
  expect(result.text).toMatch(/actual user reply|actual.*answer/i);
  expect((await port(result.text)).text).toBe(result.text);
  const unknown=await port(automationPattern.replace('collaborative:','unrecognized-mode:'));
  expect(unknown.semanticNeeded).toBe(true);
  expect(unknown.text).toContain('AskUserQuestion');
  const historical='````text\n'+automationPattern+'\n````';
  expect((await port(historical)).text).toBe(historical);
});

it('recognizes mapped instruction resources even when their preserved filenames retain source spelling', async () => {
  const result = await port('Read CLAUDE.md before writing. Read @.claude/docs/coding-standards.md.', { sourceToTarget: {
    'CLAUDE.md': 'source-context/CLAUDE.md',
    '.claude/docs/coding-standards.md': 'source-context/.claude/docs/coding-standards.md'
  } });
  expect(result.text).toContain('source-context/CLAUDE.md');
  expect(result.text).toContain('source-context/.claude/docs/coding-standards.md');
  expect(result.findings.some(f => f.code === 'workflow-instructions-map-needed')).toBe(false);
  expect(result.semanticNeeded).toBe(false);
});

it('reads optional private local instructions at runtime without demanding a packaged private file', async () => {
  const result = await port('Read CLAUDE.local.md if present for this developer; do not publish it.');
  expect(result.text).toContain('CLAUDE.local.md');
  expect(result.text).toContain('do not publish it');
  expect(result.text).toMatch(/(?:runtime|project.local).*input|input.*(?:runtime|project.local)/i);
  expect(result.findings.some(f => f.code === 'workflow-instructions-map-needed')).toBe(false);
  expect(result.semanticNeeded).toBe(false);
});

it('still blocks an unmapped instruction document that is explicitly required', async () => {
  const result = await port('CLAUDE.md is required. Read it before any source edits.');
  expect(result.text).toContain('CLAUDE.md is required');
  expect(result.findings.filter(f => f.code === 'workflow-instructions-map-needed')).toHaveLength(1);
  expect(result.semanticNeeded).toBe(true);
});

it('is text-idempotent when model output is validated a second time', async () => {
  const input = 'Show draft with AskUserQuestion. Spawn Agent in its own context window. Use TaskCreate.\nAfter writing each section, check if the status line\nshows context at or above 70%. If so, append notice.\nRead CLAUDE.md before editing. Run /review.';
  const extra = { sourceToTarget: { 'CLAUDE.md': 'source-context/CLAUDE.md' } };
  const first = await port(input, extra);
  const second = await port(first.text, extra);
  const third = await port(second.text, extra);
  expect(second.text).toBe(first.text);
  expect(third.text).toBe(first.text);
  expect(second.findings.some(f => f.severity === 'blocking')).toBe(false);
});

it('retains unmet strict controls with one blocker per file on repeated validation', async () => {
  const first = await port('A separate read-only sandbox is a hard requirement. A separate network sandbox is a hard requirement.');
  const second = await port(first.text);
  expect(second.text).toBe(first.text);
  expect(second.semanticNeeded).toBe(true);
  expect(second.findings.filter(f => f.code === 'workflow-strict-runtime-control')).toHaveLength(1);
});

it('does not infer delegation from resource paths or unrelated independent systems', async () => {
  const first = await port('Inspect independent systems and read CLAUDE.md. Asset `assets/Agent/icon.svg` stays unchanged.', { sourceToTarget: { 'CLAUDE.md': 'source-context/CLAUDE.md' } });
  const second = await port(first.text, { sourceToTarget: { 'CLAUDE.md': 'source-context/CLAUDE.md' } });
  expect(first.text).toContain('assets/Agent/icon.svg');
  expect(first.findings.some(f => f.code === 'workflow-delegation-runtime-required')).toBe(false);
  expect(second.findings.some(f => f.code === 'workflow-delegation-runtime-required')).toBe(false);
  expect(second.text).toBe(first.text);
});

it('ports inline role selectors into actual delegation without inventing a target tool parameter', async () => {
  const result = await port('Spawn `subagent_type: [primary specialist]` with the ADR and engine version.\n- `subagent_type: qa-lead` — independent sign-off\nThe parent owns all file writes.');
  expect(result.text).not.toContain('subagent_type');
  expect(result.text).toContain('[primary specialist]');
  expect(result.text).toContain('qa-lead');
  expect(result.text).toContain('The parent owns all file writes.');
  expect(result.text).toMatch(/actual Codex subagent delegation/);
  expect(result.text).toMatch(/unavailable.*stop|stop.*unavailable/i);
  expect(result.semanticNeeded).toBe(false);
});

it('distinguishes source-project branding from an active unsupported platform guarantee', async () => {
  const brand = await port('# Claude Code Example Studio\nWelcome to Claude Code Example Studio. Before I suggest anything, what is your project?');
  expect(brand.text).toContain('Claude Code Example Studio');
  expect(brand.semanticNeeded).toBe(false);
  const guarantee = await port('Claude Code loads all scoped rules automatically and applies its permission settings at startup.');
  expect(guarantee.text).toContain('loads all scoped rules automatically');
  expect(guarantee.semanticNeeded).toBe(true);
});

it('keeps absent documented fallback config as an explicit project runtime input rather than a missing packaged guide', async () => {
  const result = await port('Resolve engine.name from project.yaml; if absent, fall back to `.claude/docs/custom-engine-preferences.md`. This legacy fallback supplies configured values.');
  expect(result.text).toContain('.claude/docs/custom-engine-preferences.md');
  expect(result.text).toMatch(/project.*runtime input/i);
  expect(result.text).toMatch(/required.*(?:missing|absent)|(?:missing|absent).*required/i);
  expect(result.findings.some(f => f.code === 'workflow-instructions-map-needed')).toBe(false);
  expect(result.semanticNeeded).toBe(false);
});

it('does not waive an absent required operational guide as a project configuration input', async () => {
  const result = await port('Read `.claude/docs/mandatory-review-procedure.md` before approval. This guide is required and defines the independent review rules.');
  expect(result.findings.some(f => f.code === 'workflow-instructions-map-needed')).toBe(true);
  expect(result.semanticNeeded).toBe(true);
});

it('allows absent optional templates to be looked up in the project without pretending they were bundled', async () => {
  const result = await port('Read `.claude/docs/templates/user-report.md` if present; otherwise draft from the agreed schema. Do not overwrite a custom template.');
  expect(result.text).toContain('otherwise draft from the agreed schema');
  expect(result.text).toMatch(/runtime input/i);
  expect(result.findings.some(f => f.code === 'workflow-instructions-map-needed')).toBe(false);
  expect(result.semanticNeeded).toBe(false);
});

it('ports fork-complexity rubric predicates without relaxing required independent context', async () => {
  const result = await port('### Check 6 — Fork Context Complexity\nIf frontmatter contains `context: fork`, the skill should have ≥5 phase headings.\nWARN if `context: fork` is set but fewer than 5 phases found.\n### Check 7 — Behavioral Controls\nIndependent review requires its own context window.');
  expect(result.text).not.toContain('context: fork');
  expect(result.text).toContain('≥5 phase headings');
  expect(result.text).toContain('fewer than 5 phases');
  expect(result.text).toContain('Independent review requires its own context window.');
  expect(result.text).toMatch(/actual.*delegat|delegat.*actual/i);
  expect(result.semanticNeeded).toBe(false);
});

it('maps preserved role and workflow definition resources rather than flagging their known source paths missing', async () => {
  const result = await port('Read `.claude/skills/review/CONTRACT.md` and `.claude/agents/designer.md` before delegation.', { sourceToTarget: {
    '.claude/skills/review/CONTRACT.md': 'skills/review/CONTRACT.md',
    '.claude/agents/designer.md': 'source-context/.claude/agents/designer.md'
  } });
  expect(result.text).toContain('skills/review/CONTRACT.md');
  expect(result.text).not.toContain('`.claude/skills/review/CONTRACT.md`');
  expect(result.text).toContain('source-context/.claude/agents/designer.md');
  expect(result.findings.some(f => f.code === 'workflow-instructions-map-needed')).toBe(false);
});

it('keeps template discovery conditional without declaring absent templates packaged', async () => {
  const result = await port('Glob for `docs/custom.md` and `.claude/docs/templates/custom.md`.\nIf found, use the custom template. If none exists, use the default schema.');
  expect(result.text).toContain('If none exists, use the default schema.');
  expect(result.text).toMatch(/runtime input/);
  expect(result.findings.some(f => f.code === 'workflow-instructions-map-needed')).toBe(false);
});

it('treats a documented private local-file creation template as an output instead of an absent import', async () => {
  const result = await port('# CLAUDE.local.md Template\nCopy this file to the project root as `CLAUDE.local.md` for personal overrides.\nKeep it private.');
  expect(result.text).toContain('Copy this file');
  expect(result.text).toContain('Keep it private.');
  expect(result.findings.some(f => f.code === 'workflow-instructions-map-needed')).toBe(false);
});

it('does not confuse warnings against invented isolation with a requirement to supply that isolation', async () => {
  const result = await port('Independent review requires actual clean-context delegation; never claim a separate sandbox from prose.');
  expect(result.text).toContain('never claim a separate sandbox from prose');
  expect(result.findings.some(f => f.code === 'workflow-strict-runtime-control')).toBe(false);
});

it('preserves game-interface widgets while porting actual question widgets in the same document', async () => {
  const input = 'UI: UMG widget hierarchy, widget lifecycle and data binding must be preserved.\nUse AskUserQuestion for the approval widget after showing the draft.\nThe widget must appear with the draft.';
  const result = await port(input);
  expect(result.text).toContain('UMG widget hierarchy, widget lifecycle and data binding');
  expect(result.text).not.toContain('approval widget');
  expect(result.text).toContain('decision prompt');
  const onlyUi = await port('UMG widget hierarchy and visual widgets belong to the UI specialist.');
  expect(onlyUi.text).toBe('UMG widget hierarchy and visual widgets belong to the UI specialist.');
  expect(onlyUi.findings.some(f => f.code === 'workflow-question-presentation-ported')).toBe(false);
});

it('merges project instruction writes into scoped AGENTS.md while keeping packaged conventions read-only', async () => {
  const result = await port('Read `CLAUDE.md` for the source conventions.\nShow the engine changes. Ask: "May I write these settings to `CLAUDE.md`?"\nUpdate `src/CLAUDE.md` after approval.', { sourceToTarget: {
    'CLAUDE.md': 'source-context/CLAUDE.md', 'src/CLAUDE.md': 'source-context/src/CLAUDE.md'
  } });
  expect(result.text).toContain('Read `source-context/CLAUDE.md`');
  expect(result.text).toContain('May I write these settings to `<project-root>/AGENTS.md`');
  expect(result.text).toContain('Update `<project-root>/src/AGENTS.md` after approval');
  expect(result.text).toMatch(/read existing.*AGENTS\.md|AGENTS\.md.*read existing/i);
  expect(result.text).toMatch(/merge.*(?:approved|authorized)|(?:approved|authorized).*merge/i);
  expect(result.text).toMatch(/never.*(?:installed|cache)|(?:installed|cache).*read.only/i);
});

it('repairs an already mapped packaged project-instruction write without changing read references', async () => {
  const result = await port('Read `source-context/CLAUDE.md`.\nWrite approved settings to `source-context/CLAUDE.md`.', { sourceToTarget: { 'CLAUDE.md': 'source-context/CLAUDE.md' } });
  expect(result.text).toContain('Read `source-context/CLAUDE.md`');
  expect(result.text).toContain('Write approved settings to `<project-root>/AGENTS.md`');
});

it('keeps improvement baseline, retest and rollback on an approved local fork without installed-cache writes', async () => {
  const input = 'Run an improvement loop: baseline test → fix → retest → keep or revert.\nRead the skill `.claude/skills/[name]/SKILL.md`.\nAsk: "May I write the improved version to `.claude/skills/[name]/SKILL.md`?"\nWrite the improved skill to `.claude/skills/[name]/SKILL.md`.\nIf worse, ask before restoring each changed file from its saved pre-edit content.';
  const result = await port(input);
  expect(result.text).not.toContain('.claude/skills/[name]/SKILL.md');
  expect(result.text).toContain('<project-root>/.agents/skills/[name]/SKILL.md');
  expect(result.text).toMatch(/export.*(?:complete|entire|full)|(?:complete|entire|full).*export/i);
  expect(result.text).toMatch(/baseline.*(?:same|exact).*fork|(?:same|exact).*fork.*baseline/i);
  expect(result.text).toMatch(/never.*(?:installed|cache)/i);
  expect(result.text).toContain('ask before restoring each changed file from its saved pre-edit content');
  expect((await port(result.text)).text).toBe(result.text);
});

it('tests target schema, argument grammar and actual writes instead of unsupported source metadata', async () => {
  const result = await port('### Check 1 — Required Frontmatter Fields\n- `name:`\n- `description:`\n- `allowed-tools:`\n- `model:`\n- `argument-hint:`\n- `user-invocable:`\nFAIL if any are absent.\n### Check 4 — Collaborative Protocol Language\nFAIL if `allowed-tools` includes Write or Edit but no ask-before-write language is found.\n### Check 7 — Argument Hint Plausibility\n`argument-hint` must be non-empty. Cross-reference the hint against the first phase\'s Parse Arguments section.\nWARN if hint is empty or documented modes do not match the hint.');
  expect(result.text).not.toMatch(/^- `(?:argument-hint|user-invocable):`/m);
  expect(result.text).not.toContain('FAIL if `allowed-tools` includes');
  expect(result.text).toMatch(/FAIL.*(?:writes|edits).*approval|FAIL.*(?:writes|edits).*ask.before.write/i);
  expect(result.text).toMatch(/documented argument grammar/i);
  expect(result.text).toContain('FAIL if any are absent.');
  expect(result.text).toContain('WARN');
});
it('ports inline static-assertion metadata checklists while retaining functional verdicts', async () => {
  const result = await port('### Static Assertions\n- [ ] Has required frontmatter fields: name, description, argument-hint, user-invocable, allowed-tools\n- [ ] Requires approval before catalog updates.\nFAIL when a required functional assertion is unmet.');
  expect(result.text).not.toContain('Has required frontmatter fields:');
  expect(result.text).toContain('name, description');
  expect(result.text).toMatch(/actual.*invocation policy/i);
  expect(result.text).toMatch(/source.*provenance/i);
  expect(result.text).toContain('- [ ] Requires approval before catalog updates.');
  expect(result.text).toContain('FAIL when a required functional assertion is unmet.');
  expect((await port(result.text)).text).toBe(result.text);
});

it('revalidates a previously partially converted metadata checklist without requiring dropped source fields', async () => {
  const result = await port('### Check 1 — Required Frontmatter Fields\n- `name:`\n- `description:`\n- `argument-hint:`\n- `user-invocable:`\nFAIL if any are absent.');
  expect(result.text).not.toMatch(/^- `(?:argument-hint|user-invocable):`/m);
  expect(result.text).toMatch(/invocation policy/);
});

it('resolves audit skill and role discovery against actual Codex resources instead of legacy project folders', async () => {
  const result = await port('For static all, Glob `.claude/skills/*/SKILL.md`. For spec, read `.claude/skills/[name]/SKILL.md` or `.claude/agents/[name].md`. Missing target is NOT ASSESSED.');
  expect(result.text).not.toContain('.claude/skills/*/SKILL.md');
  expect(result.text).not.toContain('.claude/agents/[name].md');
  expect(result.text).toMatch(/actual Codex skill catalog/i);
  expect(result.text).toMatch(/preserved.*(?:role|specialist).*definition/i);
  expect(result.text).toContain('Missing target is NOT ASSESSED');
});

it('ports backticked write-capability predicates in one stable pass', async () => {
  const first = await port('**FAIL** if `allowed-tools` includes `Write` or `Edit` but no ask-before-write language is found.');
  expect(first.text).not.toContain('`allowed-tools` includes');
  expect((await port(first.text)).text).toBe(first.text);
});
