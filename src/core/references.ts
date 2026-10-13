import { posix } from 'node:path';
import type { BundleFile, Finding, SourceSnapshot } from '../shared/contracts';
import { safeRelativePath } from './paths';
export function preserveReferences(snapshot: SourceSnapshot, files: Map<string,BundleFile>, put: (path: string, data: string|Buffer, sourcePath?: string, replace?: boolean) => void, findings: Finding[], converted = false): void {
  const sources = new Map(snapshot.files.map(f => [f.path, f]));
  const roots = (paths: string[]) => paths.filter(path => /(^|\/)SKILL\.md$/.test(path)).map(path => path.replace(/(^|\/)SKILL\.md$/, ''));
  const sourceRoots = roots([...sources.keys()]); const targetRoots = roots([...files.keys()]);
  const skillRoot = (path: string, candidates: string[]) => candidates.filter(root => !root || path.startsWith(root + '/')).sort((a,b) => b.length - a.length)[0];
  const projectAsset = (file: BundleFile, local: string) => {
    if (!local.startsWith('assets/')) return false;
    const root = skillRoot(file.sourcePath!, sourceRoots);
    const instructions = sources.get(root ? root + '/SKILL.md' : 'SKILL.md')?.data.toString() || '';
    // An explicit working-directory contract applies to the skill's reference documents too.
    if (/\bscripts read and write project files\b/i.test(instructions)) return true;
    const literal = local.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const declaration = new RegExp('\\b(?:write|generate|save|output)\\b(?:\\s+(?:project|generated|output|file|to|the|a|new))*\\s+`' + literal + '`', 'i');
    return [instructions, sources.get(file.sourcePath!)?.data.toString() || ''].some(text => declaration.test(text));
  };
  const pending = [...files.keys()].filter(path => /^skills\/[^/]+\//.test(path) && path.endsWith('.md'));
  const queued = new Set(pending);
  const enqueue = (path: string) => { if (path.endsWith('.md') && !queued.has(path)) { queued.add(path); pending.push(path); } };
  const visited = new Set<string>();
  for (const path of pending) {
    const file = files.get(path)!;
    if (!file.sourcePath || !file.path.endsWith('.md') || visited.has(file.path)) continue;
    visited.add(file.path);
    const rewrite = (raw: string, inline = false): string => {
      if (!raw || raw.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//')) return raw;
      const [encoded, fragment = ''] = raw.split(/(?=#)/, 2);
      try {
        const warn = (code: string, message: string) => {
          if (!findings.some(f => f.code === code && f.file === file.path && f.message === message)) findings.push({ code, severity: 'warning', message, file: file.path });
          return raw;
        };
        const local = decodeURIComponent(encoded!);
        const rooted = inline && /^(references|scripts|assets)\//.test(local);
        const targetBase = rooted ? skillRoot(file.path, targetRoots) ?? posix.dirname(file.path) : posix.dirname(file.path);
        const sourceBase = rooted ? skillRoot(file.sourcePath!, sourceRoots) ?? posix.dirname(file.sourcePath!) : posix.dirname(file.sourcePath!);
        if (inline && /[*?{}]/.test(local)) {
          const base = converted ? targetBase : sourceBase;
          const pattern = posix.normalize(posix.join(base, local));
          safeRelativePath(pattern.replace(/\{[^{}]+\}|\*|\?/g, 'pattern'));
          const escaped = pattern.replace(/[.+^$()|[\]\\]/g, '\\$&').replace(/\{[^{}]+\}|\*/g, '[^/]*').replace(/\?/g, '[^/]');
          const matcher = new RegExp('^' + escaped + '$');
          const candidates = [...(converted ? files : sources).keys()].filter(path => matcher.test(path));
          if (!candidates.length) throw new Error('Padrão de referência sem recursos correspondentes: ' + raw);
          for (const candidate of candidates) {
            const relative = posix.relative(base, candidate);
            if (rewrite(relative, true) !== relative) throw new Error('Padrão de referência exige adaptação de caminho: ' + raw);
          }
          return warn('dynamic-reference', 'Recursos do padrão foram preservados; confira a seleção durante o uso: ' + raw);
        }
        if (converted) {
          const target = safeRelativePath(posix.normalize(posix.join(targetBase, local)));
          if (!files.has(target) && inline && projectAsset(file, local)) return warn('project-file-reference', 'Caminho de projeto ou saída gerada, não incluído como recurso da skill: ' + raw);
          if (!files.has(target)) throw new Error('Referência não encontrada no pacote convertido: ' + raw);
          enqueue(target);
          return raw;
        }
        const origin = safeRelativePath(posix.normalize(posix.join(sourceBase, local)));
        const source = sources.get(origin);
        if (!source && inline && projectAsset(file, local)) return warn('project-file-reference', 'Caminho de projeto ou saída gerada, não incluído como recurso da skill: ' + raw);
        if (!source) throw new Error('Referência local não encontrada: ' + raw);
        if (source.mode === '160000' || source.data.toString('utf8',0,100).startsWith('version https://git-lfs.github.com/spec/v1')) throw new Error('Referência depende de recurso externo: ' + raw);
        let destination = [...files.values()].find(f => f.sourcePath === origin)?.path;
        if (!destination) {
          if (/(^|\/)SKILL\.md$|(^|\/)\.claude-plugin\/|(^|\/)hooks\//.test(origin)) throw new Error('Referência ativa a outro componente exige seleção e adaptação explícitas: ' + raw);
          destination = origin; put(destination, source.data, origin);
        }
        enqueue(destination);
        return (posix.relative(targetBase, destination) || posix.basename(destination)) + fragment;
      } catch (error) { findings.push({ code: 'missing-reference', severity: 'blocking', message: (error as Error).message, file: file.path }); return raw; }
    };
    let text = file.data.toString();
    text = text.replace(/(!?\[[^\]\n]*\]\()(<[^>]+>|[^\s)]+)([^)\n]*\))/g, (_all, prefix: string, value: string, suffix: string) => {
      const angle = value.startsWith('<'); const target = angle ? value.slice(1,-1) : value;
      return prefix + (angle ? '<' + rewrite(target) + '>' : rewrite(target)) + suffix;
    });
    text = text.replace(/`((?:\.\.?\/|references\/|scripts\/|assets\/)[^`\s]+\.[a-zA-Z0-9]+)`/g, (_all, path: string) => '`' + rewrite(path, true) + '`');
    put(file.path, text, file.sourcePath, true);
  }
}
