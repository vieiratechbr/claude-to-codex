import type { Finding } from '../../shared/contracts';
export function adaptHooks(present: boolean): Finding[] {
  return present ? [{ code: 'unsupported-hook', severity: 'blocking', message: 'Hooks executáveis precisam de equivalência de eventos, payloads e efeitos comprovada. O pacote permanece bloqueado para instalação.' }] : [];
}
