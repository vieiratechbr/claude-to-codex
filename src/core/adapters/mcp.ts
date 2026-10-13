import type { Finding } from '../../shared/contracts';
export function adaptMcp(input: unknown): { servers: Record<string,unknown>; findings: Finding[] } {
  const findings: Finding[] = []; const servers: Record<string,unknown> = Object.create(null);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Configuração MCP inválida.');
  const value = input as Record<string,unknown>; const list = value.mcpServers ?? value;
  if (!list || typeof list !== 'object' || Array.isArray(list)) throw new Error('Servidores MCP inválidos.');
  for (const [name, raw] of Object.entries(list)) {
    if (!/^[a-zA-Z0-9_-]+$/.test(name) || !raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Servidor MCP inválido.');
    const server = raw as Record<string,unknown>;
    const content = JSON.stringify(server);
    if (/\$\{(?:CLAUDE_[A-Z_]+|user_config\.)/.test(content)) {
      findings.push({ code: 'mcp-variable', severity: 'blocking', message: 'O servidor ' + name + ' depende de variáveis do Claude. Configure caminhos e credenciais equivalentes.' }); continue;
    }
    if (server.url) {
      const url = new URL(String(server.url));
      if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname))) throw new Error('URL MCP insegura.');
      if (url.username || url.password) throw new Error('Não copie credenciais dentro da URL MCP.');
      if (server.type === 'sse') { findings.push({ code: 'mcp-transport', severity: 'blocking', message: 'Transporte SSE requer adaptação explícita para ' + name + '.' }); continue; }
      servers[name] = { ...server, type: 'http' };
    } else if (typeof server.command === 'string' && (!server.args || Array.isArray(server.args) && server.args.every(arg => typeof arg === 'string'))) {
      servers[name] = { ...server, type: 'stdio' };
    } else throw new Error('Servidor MCP sem transporte válido.');
    findings.push({ code: 'mcp-setup', severity: 'warning', message: 'Servidor ' + name + ': confira runtime, credenciais e autenticação no Codex. Sua conexão não foi testada.' });
  }
  return { servers, findings };
}
