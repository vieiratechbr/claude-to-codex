import { posix } from 'node:path';
import type { BundleFile, Finding, SourceSnapshot } from '../shared/contracts';
import { safeRelativePath } from './paths';
export function preserveReferences(snapshot: SourceSnapshot, files: Map<string,BundleFile>, put: (path: string, data: string|Buffer, sourcePath?: string, replace?: boolean) => void, findings: Finding[], converted = false): void {
  const sources = new Map(snapshot.files.map(f => [f.path, f]));
  const visited = new Set<string>();
  for (const file of files.values()) {
    if (!file.sourcePath || !file.path.endsWith('.md') || visited.has(file.path)) continue;
    visited.add(file.path);
    const rewrite = (raw: string): string => {
      if (!raw || raw.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//')) return raw;
      const [encoded, fragment = ''] = raw.split(/(?=#)/, 2);
      try {
        const local = decodeURIComponent(encoded!);
        if (converted) {
          const target = safeRelativePath(posix.normalize(posix.join(posix.dirname(file.path), local)));
          if (!files.has(target)) throw new Error('Referência não encontrada no pacote convertido: ' + raw);
          return raw;
        }
        const origin = safeRelativePath(posix.normalize(posix.join(posix.dirname(file.sourcePath!), local)));
        const source = sources.get(origin);
        if (!source) throw new Error('Referência local não encontrada: ' + raw);
        if (source.mode === '160000' || source.data.toString('utf8',0,100).startsWith('version https://git-lfs.github.com/spec/v1')) throw new Error('Referência depende de recurso externo: ' + raw);
        let destination = [...files.values()].find(f => f.sourcePath === origin)?.path;
        if (!destination) {
          if (/(^|\/)SKILL\.md$|(^|\/)\.claude-plugin\/|(^|\/)hooks\//.test(origin)) throw new Error('Referência ativa a outro componente exige seleção e adaptação explícitas: ' + raw);
          destination = origin; put(destination, source.data, origin);
        }
        return (posix.relative(posix.dirname(file.path), destination) || posix.basename(destination)) + fragment;
      } catch (error) { findings.push({ code: 'missing-reference', severity: 'blocking', message: (error as Error).message, file: file.path }); return raw; }
    };
    let text = file.data.toString();
    text = text.replace(/(!?\[[^\]\n]*\]\()(<[^>]+>|[^\s)]+)([^)\n]*\))/g, (_all, prefix: string, value: string, suffix: string) => {
      const angle = value.startsWith('<'); const target = angle ? value.slice(1,-1) : value;
      return prefix + (angle ? '<' + rewrite(target) + '>' : rewrite(target)) + suffix;
    });
    text = text.replace(/`((?:\.\.?\/|references\/|scripts\/|assets\/)[^`\s]+\.[a-zA-Z0-9]+)`/g, (_all, path: string) => '`' + rewrite(path) + '`');
    put(file.path, text, file.sourcePath, true);
  }
}
