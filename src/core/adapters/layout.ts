import type { Finding, SourceFile } from '../../shared/contracts';
import { safeRelativePath } from '../paths';
export function resolveLayout(manifest: Record<string,unknown>, files: SourceFile[], relative: (path: string) => string): { skillRoots: string[]; prompts: { name: string; text: string; kind: 'command'|'agent'; sourcePath?: string }[]; findings: Finding[] } {
  const findings: Finding[] = []; const prompts: { name: string; text: string; kind: 'command'|'agent'; sourcePath?: string }[] = [];
  const paths = (raw: unknown, fallback: string[]): string[] => {
    if (raw === undefined) return fallback;
    return (Array.isArray(raw) ? raw : [raw]).map(value => {
      if (typeof value !== 'string') throw new Error('Caminho de componente inválido.');
      return value === '.' || value === './' ? '' : safeRelativePath(value.replace(/^\.\//, '').replace(/\/$/, ''));
    });
  };
  let dirs = ['skills'];
  try {
    const declared = paths(manifest.skills, []); dirs = [...dirs, ...declared];
    for (const entry of declared) if (!files.some(f => {
      const path = relative(f.path); return /(^|\/)SKILL\.md$/.test(path) && (!entry || path.startsWith(entry + '/'));
    })) findings.push({ code: 'missing-component-path', severity: 'blocking', message: 'Diretório de skills declarado sem SKILL.md: ' + (entry || '.') });
  } catch (error) { findings.push({ code: 'invalid-layout', severity: 'blocking', message: (error as Error).message }); }
  const skillRoots = files.filter(file => {
    const path = relative(file.path); if (!/(^|\/)SKILL\.md$/.test(path)) return false;
    return dirs.some(dir => !dir || path.startsWith(dir + '/'));
  }).map(file => relative(file.path).replace(/(^|\/)SKILL\.md$/, ''));
  for (const kind of ['command','agent'] as const) {
    const field = kind === 'command' ? 'commands' : 'agents'; const raw = manifest[field];
    try {
      if (kind === 'command' && raw && typeof raw === 'object' && !Array.isArray(raw)) {
        for (const [name, definition] of Object.entries(raw)) {
          if (!definition || typeof definition !== 'object' || Array.isArray(definition)) throw new Error('Comando inline inválido.');
          const value = definition as Record<string,unknown>;
          if ((typeof value.source === 'string') === (typeof value.content === 'string')) throw new Error('Comando precisa de source ou content.');
          const source = typeof value.source === 'string' ? safeRelativePath(value.source.replace(/^\.\//, '')) : undefined;
          const text = source ? files.find(f => relative(f.path) === source)?.data.toString() : String(value.content);
          if (text === undefined) throw new Error('Arquivo do comando não encontrado.');
          prompts.push({ name, text: text + (typeof value.argumentHint === 'string' ? '\n\nEntrada esperada: ' + value.argumentHint : ''), kind, sourcePath: source ? files.find(f => relative(f.path) === source)?.path : undefined });
        }
      } else {
        const entries = paths(raw, [field]);
        for (const file of files) {
          const path = relative(file.path);
          if (path.endsWith('.md') && entries.some(entry => path === entry || path.startsWith(entry + '/') && !path.slice(entry.length + 1).includes('/'))) prompts.push({ name: path.split('/').at(-1)!.replace(/\.md$/, ''), text: file.data.toString(), kind, sourcePath: file.path });
        }
        for (const entry of entries) if (!files.some(f => relative(f.path) === entry || relative(f.path).startsWith(entry + '/'))) {
          if (raw !== undefined) findings.push({ code: 'missing-component-path', severity: 'blocking', message: 'Caminho declarado não encontrado: ' + entry });
        }
      }
    } catch (error) { findings.push({ code: 'invalid-layout', severity: 'blocking', message: (error as Error).message }); }
  }
  return { skillRoots, prompts, findings };
}
