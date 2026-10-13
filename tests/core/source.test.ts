import { describe, expect, it, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseSourceRequest, readGitTree } from '../../src/core/source';
import { safeRelativePath } from '../../src/core/paths';
const temporary: string[] = [];
afterEach(async () => { for (const p of temporary.splice(0)) await rm(p, { recursive: true, force: true }); });
describe('origem e contenção', () => {
  it('normaliza uma URL pública sem aceitar credenciais ou flags', () => {
    expect(parseSourceRequest({ url: 'https://github.com/acme/tools' }).url).toBe('https://github.com/acme/tools.git');
    for (const url of ['https://token@github.com/acme/tools', 'http://github.com/a/b', 'https://evil.test/a/b', 'https://github.com/a/b?token=x']) {
      expect(() => parseSourceRequest({ url })).toThrow();
    }
    expect(() => parseSourceRequest({ url: 'https://github.com/a/b', ref: '--upload-pack=x' })).toThrow();
  });
  it.each(['../x', '/x', 'C:/x', 'foo\\bar', 'CON.txt', 'a/aux', 'a.', 'a ', '.git/config', 'x//y'])('rejeita caminho perigoso %s', (p) => {
    expect(() => safeRelativePath(p)).toThrow();
  });
  it('aceita diretórios e nomes com acentos', () => {
    expect(safeRelativePath('skills/edição/guia.md')).toBe('skills/edição/guia.md');
  });
  it('lê bytes do Git sem aplicar filtros ou executar a origem', async () => {
    const root = await mkdtemp(join(tmpdir(), 'c2c-origem-')); temporary.push(root);
    const git = (args: string[], input?: string) => execFileSync('git', ['-C', root, ...args], { input, encoding: 'utf8', windowsHide: true });
    git(['init', '-q']); git(['config', 'user.name', 'Fixture']); git(['config', 'user.email', 'fixture@example.invalid']);
    await mkdir(join(root, 'skills', 'edit'), { recursive: true });
    await writeFile(join(root, 'skills/edit/SKILL.md'), '---\nname: edit\ndescription: Editar\n---\nPreservar vídeo.');
    await writeFile(join(root, '.gitattributes'), '*.md filter=evil\n');
    git(['add', '.']); git(['commit', '-qm', 'fixture']);
    const files = await readGitTree(join(root, '.git'), 'HEAD');
    expect(files.find(f => f.path === 'skills/edit/SKILL.md')?.data.toString('utf8')).toContain('Preservar vídeo.');
    expect(files.find(f => f.path === '.gitattributes')).toBeDefined();
    const oid = git(['hash-object', '-w', '--stdin'], '../../outside').trim();
    git(['update-index', '--add', '--cacheinfo', '120000,' + oid + ',link']);
    git(['commit', '-qm', 'unsafe link']);
    await expect(readGitTree(join(root, '.git'), 'HEAD')).rejects.toThrow();
  });
});
