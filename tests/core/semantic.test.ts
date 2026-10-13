import { expect, it } from 'vitest';
import { validateSemanticResult, parseSemanticStream } from '../../src/core/semantic';
it('valida o resultado semântico sem aceitar caminhos arbitrários', () => {
  expect(validateSemanticResult({ files: [{ path: 'skills/edit/SKILL.md', content: 'ok' }], findings: [] }).files[0].content).toBe('ok');
  expect(() => validateSemanticResult({ files: [{ path: '../config.toml', content: 'x' }], findings: [] })).toThrow();
  expect(() => validateSemanticResult({ files: [], findings: [], command: 'run' })).toThrow();
});
it('extrai somente resposta final e recusa eventos de execução', () => {
  const text = JSON.stringify({ files: [{ path: 'skills/one/SKILL.md', content: 'adaptado' }], findings: [] });
  expect(parseSemanticStream(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text } })).files[0].content).toBe('adaptado');
  expect(() => parseSemanticStream(JSON.stringify({ type: 'item.started', item: { type: 'command_execution', command: 'evil' } }))).toThrow();
  expect(() => parseSemanticStream('not-json')).toThrow();
});
