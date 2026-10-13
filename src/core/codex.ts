import { access } from 'node:fs/promises';
import { delimiter, join, extname } from 'node:path';
import { homedir } from 'node:os';
import type { Diagnostics } from '../shared/contracts';
import { checkedProcess } from './process';
export async function findExecutable(name: string, manual?: string): Promise<string|undefined> {
  const candidates: string[] = [];
  if (manual) candidates.push(manual);
  for (const folder of (process.env.PATH || '').split(delimiter)) candidates.push(join(folder, name + (process.platform === 'win32' ? '.exe' : '')));
  if (name === 'codex' && process.platform === 'win32') {
    candidates.push(join(process.env.LOCALAPPDATA || join(homedir(), 'AppData/Local'), 'Programs/OpenAI/Codex/bin/codex.exe'));
  }
  for (const file of candidates) {
    if (['.cmd', '.bat'].includes(extname(file).toLowerCase())) continue;
    try { await access(file); return file; } catch {}
  }
}
export async function diagnoseCodex(settings: { codexPath?: string; gitPath?: string } = {}): Promise<Diagnostics> {
  const result: Diagnostics = { authenticated: false, capabilities: { exec: false, pluginAdd: false, marketplaceAdd: false, pluginListJson: false, isolatedConversion: false }, findings: [] };
  result.gitPath = await findExecutable('git', settings.gitPath); result.codexPath = await findExecutable('codex', settings.codexPath);
  for (const [name, path] of [['Git', result.gitPath], ['Codex', result.codexPath]] as const) {
    if (!path) { result.findings.push({ code: 'missing-' + name.toLowerCase(), severity: 'blocking', message: name + ' não encontrado. Instale ou selecione o executável.' }); continue; }
    try {
      const version = (await checkedProcess(path, ['--version'])).stdout.toString().trim();
      if (name === 'Git') result.gitVersion = version; else result.codexVersion = version;
    } catch (error) { result.findings.push({ code: 'diagnostic-error', severity: 'blocking', message: (error as Error).message }); }
  }
  if (result.codexPath) {
    const checks = [['exec', ['exec', '--help']], ['pluginAdd', ['plugin', 'add', '--help']], ['marketplaceAdd', ['plugin', 'marketplace', 'add', '--help']], ['pluginListJson', ['plugin', 'list', '--help']]] as const;
    for (const [key, args] of checks) {
      try { const help = (await checkedProcess(result.codexPath, args)).stdout.toString(); result.capabilities[key] = key !== 'pluginListJson' || help.includes('--json'); } catch {}
    }
    try { await checkedProcess(result.codexPath, ['login', 'status']); result.authenticated = true; } catch { result.findings.push({ code: 'login-needed', severity: 'warning', message: 'Entre no Codex para usar a conversão assistida. Execute codex login.' }); }
    try {
      await checkedProcess(result.codexPath, ['--disable', 'shell_tool', '--disable', 'unified_exec', '--disable', 'hooks', '--disable', 'apps', '--disable', 'multi_agent', '--disable', 'remote_plugin', '--disable', 'skill_mcp_dependency_install', '--disable', 'memories', 'exec', '--help']);
      result.capabilities.isolatedConversion = result.capabilities.exec;
    } catch { result.findings.push({ code: 'conversion-capabilities', severity: 'warning', message: 'Atualize o Codex para usar a conversão assistida com isolamento.' }); }
  }
  return result;
}
