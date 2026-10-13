import { expect, it } from 'vitest';
import { resolveAppResource, isTrustedSender } from '../../src/main/protocol';
it('contém recursos da janela e recusa frames externos', () => {
  expect(() => resolveAppResource('app://local/../../secret', '/renderer')).toThrow();
  expect(() => resolveAppResource('https://evil.test/index.html', '/renderer')).toThrow();
  const frame = { url: 'app://local/index.html' };
  expect(isTrustedSender(frame, frame)).toBe(true);
  expect(isTrustedSender({ url: 'https://evil.test' }, frame)).toBe(false);
  expect(isTrustedSender({ url: 'app://local/index.html' }, frame)).toBe(false);
});
