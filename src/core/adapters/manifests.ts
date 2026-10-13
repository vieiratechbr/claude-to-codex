import type { Finding } from '../../shared/contracts';
export function adaptManifest(source: Record<string,unknown>, name: string, owner: string): { manifest: Record<string,unknown>; findings: Finding[] } {
  const known = new Set(['name','version','description','author','homepage','repository','license','keywords','skills','commands','agents','mcpServers','hooks','$schema','metadata']);
  const findings: Finding[] = Object.keys(source).filter(key => !known.has(key)).map(key => ({ code: 'unsupported-manifest-field', severity: 'blocking', message: 'Recurso do Claude sem adaptador funcional: ' + key }));
  const author = source.author && typeof source.author === 'object' && !Array.isArray(source.author) ? source.author : { name: owner };
  return { manifest: { name, version: typeof source.version === 'string' ? source.version : '0.1.0', description: typeof source.description === 'string' ? source.description : 'Workflow convertido de ' + String(source.name || name), author, skills: './skills/', ...(typeof source.license === 'string' ? { license: source.license } : {}) }, findings };
}
