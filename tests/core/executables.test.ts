import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { findExecutable } from '../../src/core/codex';

describe.skipIf(process.platform !== 'win32')('detecção de executáveis fora do PATH no Windows', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'c2c-executables-'));
    vi.stubEnv('PATH', '');
    vi.stubEnv('ProgramFiles', join(root, 'Program Files'));
    vi.stubEnv('ProgramFiles(x86)', join(root, 'Program Files (x86)'));
    vi.stubEnv('LOCALAPPDATA', join(root, 'Local AppData'));
    vi.stubEnv('USERPROFILE', join(root, 'User Profile'));
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true });
  });
  async function executable(path: string) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, 'discovery fixture; never executed');
    return path;
  }

  it('encontra o Git for Windows instalado por máquina sem PATH', async () => {
    const git = await executable(join(root, 'Program Files', 'Git', 'cmd', 'git.exe'));
    expect(await findExecutable('git')).toBe(git);
  });
  it('encontra o Git for Windows instalado por usuário sem PATH', async () => {
    const git = await executable(join(root, 'Local AppData', 'Programs', 'Git', 'cmd', 'git.exe'));
    expect(await findExecutable('git')).toBe(git);
  });
  it('encontra o Git do runtime principal do Codex sem PATH', async () => {
    const git = await executable(join(root, 'User Profile', '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'native', 'git', 'cmd', 'git.exe'));
    expect(await findExecutable('git')).toBe(git);
  });
  it('preserva a prioridade do executável explícito e depois do PATH', async () => {
    const manual = await executable(join(root, 'manual', 'git.exe'));
    const pathGit = await executable(join(root, 'path', 'git.exe'));
    await executable(join(root, 'Program Files', 'Git', 'cmd', 'git.exe'));
    vi.stubEnv('PATH', dirname(pathGit));
    expect(await findExecutable('git', manual)).toBe(manual);
    expect(await findExecutable('git')).toBe(pathGit);
  });
  it('ignora diretórios com nome de executável e atalhos cmd', async () => {
    const directory = join(root, 'directory', 'git.exe');
    await mkdir(directory, { recursive: true });
    const shortcut = await executable(join(root, 'shortcut', 'git.cmd'));
    expect(await findExecutable('git', directory)).toBeUndefined();
    expect(await findExecutable('git', shortcut)).toBeUndefined();
  });
  it('retorna ausente quando nenhuma instalação conhecida existe', async () => {
    expect(await findExecutable('git')).toBeUndefined();
  });
});
