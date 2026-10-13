# Claude to Codex Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execution is native in this conversation; no parallel implementers.

**Goal:** Entregar um aplicativo Windows que converta extensões do Claude Code obtidas pelo GitHub e gerencie sua instalação no Codex local com validação e recuperação.

**Architecture:** Electron hospeda uma interface React e um núcleo TypeScript. O núcleo lê objetos Git sem executar a origem, combina adaptadores estruturais com respostas validadas do Codex e instala pacotes por um marketplace local gerenciado. Operações e backups ficam no diretório de dados do aplicativo.

**Tech Stack:** Node.js 24, TypeScript, Electron, React, Vite, Vitest, Playwright para Electron e electron-builder. As dependências serão fixadas no package-lock.json; versões consultadas em 13/10/2026: Electron 44.7.0, React 19.3.0, Vite 8.3.4, TypeScript 7.0.2, Vitest 5.0.4 e electron-builder 26.15.3.

**Spec:** ../specs/2026-10-13-claude-to-codex-design.md

## Global Constraints

- Todo o desenvolvimento e todos os commits ocorrerão diretamente na branch main. Não criar branches alternativas ou worktrees para este projeto.
- A primeira distribuição será validada no Windows.
- A interface terá texto em português na primeira versão, estados compreensíveis e erros com próximos passos concretos.
- Não executar hooks, scripts de instalação, submódulos ou dependências da origem durante a análise.
- Não editar o cache de plugins do Codex diretamente.
- Processamento e histórico ficam locais.
- Preservar autoria, avisos e licenças existentes.
- A ferramenta não terá um serviço hospedado próprio nem exigirá chave separada da API da OpenAI.

Decisões de implementação: Node >=24; TypeScript estrito; no máximo 20.000 entradas por inventário, 2 MiB por arquivo incluído e 64 MiB de conteúdo por operação. Prompt por chamada ao Codex limitado a 1 MiB; saída por processo limitada a 8 MiB; timeout de aquisição de 180 segundos e de conversão de 300 segundos. Limites excedidos produzem erro explícito, não uma conversão incompleta marcada como sucesso.

## Review Focus

1. Caminhos Windows com espaços e acentos, Codex instalado fora do PATH e shims .cmd: descobrir ou selecionar o executável real sem construir comandos de shell.
2. Identificadores duplicados e caminhos perigosos: detectar colisões sem diferenciar maiúsculas e minúsculas; recusar caminhos absolutos, dispositivos Windows, links, traversal e arquivos fora da área gerenciada.
3. Repositórios com marketplaces e múltiplos plugins: seleção explícita e preservação de recursos compartilhados, sem incluir componentes alheios à seleção silenciosamente.
4. Configuração alterada pelo usuário durante instalação ou recuperação: preservar essas alterações e apresentar conflito, em vez de restaurar um snapshot sobre elas.
5. Conteúdo que instrui o modelo a executar código ou saída inesperada do Codex: impedir execução da origem e impedir que a resposta controle caminhos, comandos ou a instalação real.

## Organização e contratos

`src/shared/contracts.ts` define os DTOs enviados à janela. `src/core/` contém processos, origem, inventário, conversão, armazenamento e instalação. `src/main/` contém a janela, o protocolo local, IPC e o preload. `src/renderer/` contém o fluxo visual. `tests/fixtures/` guarda exemplos artificiais explícitos; nenhum teste de instalação usa o ambiente pessoal do mantenedor.

Tipos centrais: `SourceRequest { url: string; ref?: string; subdirectory?: string }`; `SourceFile { path: string; mode: string; oid: string; data: Buffer }`; `SourceSnapshot { id: string; request: SourceRequest; commit: string; files: SourceFile[]; warnings: string[] }`; `SourceComponent { id: string; kind: 'skill'|'plugin'; root: string; name: string; files: string[]; findings: Finding[] }`; `Finding { code: string; severity: 'info'|'warning'|'blocking'; message: string; file?: string }`; `BundleFile { path: string; data: Buffer; sha256: string }`; `ConversionBundle { id: string; pluginName: string; sourceCommit: string; files: BundleFile[]; findings: Finding[]; installable: boolean }`.

DTOs não transportam Buffer, credenciais ou caminhos de escrita escolhidos pela interface. Prévia de arquivos usa texto, tamanho e hash; a ponte identifica operações e componentes por IDs gerados no processo principal.

Contratos de execução: `ProcessOptions { cwd?: string; env?: NodeJS.ProcessEnv; stdin?: string|Buffer; signal?: AbortSignal; timeoutMs: number; maxBytes: number }`; `ProcessResult { exitCode: number; stdout: Buffer; stderr: string }`; `SourceContext { dataRoot: string; gitPath: string; signal?: AbortSignal; onProgress?: (progress: ProgressEvent) => void }`. `Diagnostics { gitPath?: string; codexPath?: string; gitVersion?: string; codexVersion?: string; authenticated: boolean; capabilities: { exec: boolean; pluginAdd: boolean; marketplaceAdd: boolean; pluginListJson: boolean; isolatedConversion: boolean }; findings: Finding[] }`.

Contratos de conversão: `ConversionOptions { useCodex: boolean; diagnostics: Diagnostics; dataRoot: string; signal?: AbortSignal; onProgress?: (progress: ProgressEvent) => void }`; `SemanticResult { files: { path: string; content: string }[]; findings: Finding[] }`. `InstallResult { operationId: string; installationId?: string; state: 'installed'|'updated'|'removed'|'restored'|'conflict'|'failed'; recognized: boolean; findings: Finding[] }`. `ProgressEvent { operationId: string; stage: string; message: string; completed?: number; total?: number }`. O tratamento de erros usa códigos estáveis; mensagens de processos são redigidas antes de chegar à interface.

Cada tarefa termina com a suíte completa e um commit na main. Se o contrato ou um comportamento implícito exigir ajuste, registrar a decisão no ledger de execução e adicionar o teste correspondente.

### Task 1: Diagnóstico, processos e leitura da origem

**Files:** criar package.json, package-lock.json, tsconfig.json, vitest.config.ts, .gitignore; src/shared/contracts.ts; src/core/process.ts; src/core/paths.ts; src/core/codex.ts; src/core/source.ts; src/core/inventory.ts; tests/core/process.test.ts, source.test.ts, inventory.test.ts; tests/helpers/git-fixtures.ts, file-utils.ts.

**Interfaces:** `runProcess(executable: string, args: readonly string[], options: ProcessOptions): Promise<ProcessResult>`; `parseSourceRequest(input: unknown): SourceRequest`; `readGitTree(gitDirectory: string, revision: string, limits: SourceLimits): Promise<SourceFile[]>`; `acquireSource(request: SourceRequest, context: SourceContext): Promise<SourceSnapshot>`; `inventorySource(snapshot: SourceSnapshot): SourceComponent[]`; `diagnoseCodex(settings: { codexPath?: string; gitPath?: string }): Promise<Diagnostics>`. `SourceLimits` guarda maxFiles, maxFileBytes e maxTotalBytes com os valores globais. Utilitários de teste: `exists(path: string): Promise<boolean>` e `createGitFixture(): Promise<{ gitDirectory: string; commit: string; scriptSentinel: string }>`.

- [ ] Preparar configuração de build/testes e dependências fixadas. Scripts: npm test, npm run typecheck, npm run build, npm start, npm run test:desktop, npm run dist:win. Implementar cada script junto da tarefa que entrega seu funcionamento.
- [ ] Escrever os testes antes dos comportamentos. Criar repositórios Git de fixture locais, com arquivos malformados, binários, .gitattributes, links e submódulos. Asserções essenciais:

```ts
expect(parseSourceRequest({ url: 'https://github.com/acme/tools.git' }).url)
  .toBe('https://github.com/acme/tools.git');
expect(() => parseSourceRequest({ url: 'https://token@github.com/acme/tools' })).toThrow();
expect(await readGitTree(fixture.gitDirectory, fixture.commit, limits))
  .toEqual(expect.arrayContaining([expect.objectContaining({ path: 'skills/edit/SKILL.md' })]));
expect(await exists(fixture.scriptSentinel)).toBe(false);
```

- [ ] Executar npm test -- tests/core e confirmar falhas pelos comportamentos ausentes. Testes adicionais: argv literal com metacaracteres; cancelamento; timeout; saída excessiva; limite de arquivos; nomes Windows reservados; falha de autenticação; executável em caminho com espaços e acentos.
- [ ] Implementar aquisição por clone bare e leitura por ls-tree/cat-file, sem checkout ou filtros da origem. Resolver o commit; tratar refs separadamente e não aceitar flags como refs. Identificar Git LFS ausente. Descobrir manifest explícito, layout padrão, skill na raiz e marketplace com vários plugins; inventariar campos desconhecidos e referências compartilhadas.
- [ ] Executar npm test e npm run typecheck. Commit: feat: add local diagnostics and source inventory.

### Task 2: Conversão estrutural e interpretação pelo Codex

**Files:** criar src/core/conversion.ts, adapters/skills.ts, adapters/manifests.ts, adapters/mcp.ts, adapters/hooks.ts, semantic.ts, bundle.ts; tests/core/conversion.test.ts, semantic.test.ts; tests/fixtures/{standalone-skill,multi-plugin,commands-agents,mcp,hooks,malformed}/.

**Interfaces:** `convertComponents(snapshot: SourceSnapshot, componentIds: string[], options: ConversionOptions): Promise<ConversionBundle[]>`; `adaptWithCodex(input: { files: { path: string; content: string }[]; findings: Finding[] }, context: ConversionOptions): Promise<SemanticResult>`; `validateSemanticResult(input: unknown): SemanticResult`; `validateBundle(bundle: ConversionBundle): Finding[]`. O resultado semântico contém arquivos propostos e achados estruturados, nunca comandos a executar.

- [ ] Escrever testes de preservação byte a byte dos recursos e licenças, comandos e agentes adaptados como skills com suas limitações, manifests inline e por caminho, MCP por transporte, hooks não equivalentes, recursos desconhecidos e seleção de apenas um plugin.

```ts
expect(bundle.files.find(f => f.path === 'skills/edit/references/guide.md')?.data)
  .toEqual(originalGuide);
expect(bundle.findings.some(f => f.code === 'unsupported-hook' && f.severity === 'blocking'))
  .toBe(true);
expect(() => validateSemanticResult({ files: [{ path: '../config.toml', content: 'x' }] }))
  .toThrow();
```

- [ ] Executar npm test -- tests/core/conversion.test.ts tests/core/semantic.test.ts e verificar RED. Cobrir nomes duplicados, arquivos inexistentes, saídas incompletas, JSON inválido, timeout, limites de uso e tentativas de execução de ferramentas pelo modelo.
- [ ] Implementar adaptadores que preservem comportamento verificável. Usar o formato Codex compatível com skills e MCP e produzir relatório de cada item. Uma limitação essencial torna o pacote não instalável. Manter a origem e avisos separados dos componentes ativos.
- [ ] Invocar codex exec com stdin, schema, modo read-only e flags disponíveis de isolamento. Desabilitar shell_tool, unified_exec, hooks, apps, multi_agent, remote_plugin, skill_mcp_dependency_install e memories; desabilitar web_search. Ignorar configuração e regras pessoais para esta execução, preservando autenticação oficial. O workspace de conversão não contém AGENTS.md ou código executável da origem. Falhar se a versão não suportar os controles necessários ou emitir execução de ferramentas. Validar todos os caminhos e conteúdos antes de gravar a proposta.
- [ ] Executar npm test e npm run typecheck. Commit: feat: convert Claude components into validated Codex bundles.

### Task 3: Histórico, instalação, atualização e recuperação

**Files:** criar src/core/store.ts, installer.ts, recovery.ts, provenance.ts; tests/core/store.test.ts, installer.test.ts; tests/helpers/codex-fixture.ts.

**Interfaces:** `OperationStore(root)` oferece load, save, list e find por IDs; `CodexInstaller(context)` oferece `install(bundleId, options)`, `update(installationId, bundleId)`, `remove(installationId)` e `restore(operationId)`. Resultados incluem estado, achados e reconhecimento do Codex. Os arquivos do bundle são recarregados e conferidos por hash antes da instalação.

- [ ] Escrever testes com um processo Codex de fixture que modifica uma configuração temporária e expõe falhas em etapas diferentes. Nunca simular sucesso apenas verificando uma chamada de mock.

```ts
expect((await installer.install(bundle.id, { signal })).recognized).toBe(true);
expect(await readFile(unrelatedFile, 'utf8')).toBe('preservar');
expect((await installer.restore(interrupted.id)).state).toBe('restored');
expect((await installer.restore(editedByUser.id)).state).toBe('conflict');
expect(await readFile(editedByUser.configPath, 'utf8')).toContain('alteração do usuário');
```

- [ ] Executar npm test -- tests/core/installer.test.ts tests/core/store.test.ts e verificar RED. Cobrir config ausente, escrita interrompida, bundle adulterado, instalação duplicada, concorrência entre operações, remoção de arquivos compartilhados e recuperação após reinício.
- [ ] Implementar armazenamento atômico e diário de operações. Usar IDs gerados internamente e conferir containment/links antes de leitura, remoção ou exportação. Registrar origem, revisão, hashes, avisos e versão dos adaptadores, sem credenciais.
- [ ] Registrar o marketplace claude-to-codex-local por codex plugin marketplace add; instalar por codex plugin add e verificar com plugin list filtrado por marketplace. Não habilitar hooks ou instalar dependências da origem silenciosamente. Backup apenas dos arquivos/configurações envolvidos; restaurar snapshots somente se o estado atual coincidir com o registrado após a operação. Mudança externa gera conflito e preserva o arquivo.
- [ ] Executar npm test e npm run typecheck. Commit: feat: manage recoverable Codex installations.

### Task 4: Aplicativo desktop e ponte restrita

**Files:** criar src/main/index.ts, preload.ts, protocol.ts, ipc.ts, service.ts; src/shared/api.ts; scripts/build.mjs, start.mjs; index.html; tests/main/ipc.test.ts, service.test.ts, protocol.test.ts.

**Interfaces:** `AppService` oferece diagnose, analyze, convert, install, update, remove, restore, listHistory e cancel; cada operação retorna DTOs. `window.claudeToCodex` expõe apenas esses métodos, selectCodexExecutable, readPreview, exportBundle e onProgress com função de unsubscribe. Os diálogos de arquivos ficam no processo principal.

- [ ] Escrever testes de sequência de estados e das fronteiras: IDs desconhecidos, componente fora da análise, instalação antes da revisão, dois jobs simultâneos, frame externo, argumentos malformados e URLs locais com traversal.

```ts
await expect(service.install(unknownBundleId)).rejects.toThrow();
expect(isTrustedSender(externalFrame, mainWindow)).toBe(false);
expect(() => resolveAppResource('app://local/../../secret', rendererRoot)).toThrow();
expect(service.cancel(activeOperationId)).toBe(true);
```

- [ ] Executar npm test -- tests/main e verificar RED.
- [ ] Implementar janela com contextIsolation, sandbox e nodeIntegration desabilitado. Usar protocolo local app://local, CSP restrita, validação de sender e schema por método. Bloquear navegação externa e novas janelas. Preload CJS compatível com o sandbox; main e renderer compilados separadamente. Erros devem ser DTOs redigidos para o usuário, sem expor valores sensíveis.
- [ ] Executar npm test, npm run typecheck e npm run build; abrir por npm start. Commit: feat: add native desktop shell and application service.

### Task 5: Interface completa e validação visual

**Files:** criar src/renderer/main.tsx, App.tsx, styles.css, api.d.ts; components/SourceForm.tsx, ComponentPicker.tsx, ConversionReview.tsx, History.tsx, Diagnostics.tsx; tests/desktop/app.spec.ts; playwright.config.ts.

**Interfaces:** a interface consome apenas a API do Task 4. Fluxo: origem → seleção → conversão → revisão → instalação. Histórico oferece atualização, remoção, recuperação e abertura de relatório. Configurações permitem escolher Codex, conferir caminhos e limpar apenas dados gerenciados.

- [ ] Escrever testes Playwright para Electron com dados artificiais explicitamente identificados. Fixture do serviço deve existir só nos utilitários de testes, sem um modo escondido de bypass na distribuição.

```ts
await page.getByLabel('Link do GitHub').fill(sourceUrl);
await page.getByRole('button', { name: 'Analisar repositório' }).click();
await expect(page.getByRole('heading', { name: 'Escolha os componentes' })).toBeVisible();
await expect(page.getByRole('button', { name: 'Instalar no Codex' })).toBeDisabled();
await expect(page.getByText('Requer configuração')).toBeVisible();
```

- [ ] Executar npm run test:desktop e verificar falhas pelos estados ausentes. Cobrir navegação por teclado, cancelamento, falhas com próximo passo, tentativa de saída durante operação e atualização da lista após instalar/remover.
- [ ] Implementar layout com navegação lateral, painel de entrada/etapas e resultado legível. Estilo consistente em português, contraste suficiente, foco visível e estados reais de progresso. Não renderizar Markdown de origem como HTML nem ativar links arbitrários.
- [ ] Executar npm test, npm run typecheck, npm run build e npm run test:desktop. Inspecionar screenshots em 1280×900 e 1024×768, incluindo erro, resultado parcial e histórico. Corrigir problemas que prejudiquem o fluxo. Commit: feat: deliver the conversion and installation interface.

### Task 6: Distribuição, caso real e documentação de uso

**Files:** criar electron-builder.yml, .github/workflows/ci.yml, tests/integration/codex-local.test.ts, scripts/check-local-codex.mjs; atualizar README.md; criar docs/COMPATIBILITY.md, docs/VALIDATION.md, docs/CONTRIBUTING.md.

**Interfaces:** npm run dist:win gera instalador NSIS; npm run test:codex-local usa um CODEX_HOME temporário próprio e um plugin de fixture sem hooks ou MCP executável. Build e testes de CI são reproduzíveis por npm ci; resultados de exemplo real registram origem e commit.

- [ ] Escrever teste real de instalação em ambiente temporário: registrar marketplace, instalar plugin benigno, listar seu reconhecimento, atualizar, recuperar e remover; verificar que o Codex pessoal não mudou.
- [ ] Executar o teste para demonstrar o que falta no adaptador real e implementar as diferenças de contrato encontradas. Não alterar fixtures para ocultar incompatibilidades. Executar novamente e registrar o resultado.
- [ ] Validar um repositório público real de skills do Claude Code, preservando licença e revisão. Comparar arquivos e referências, e realizar uma conversão semântica quando necessária usando o Codex autenticado; a instalação de validação continua isolada.
- [ ] Implementar empacotamento Windows e CI com npm ci, typecheck, npm test, build e teste da janela. A documentação explica requisitos, uso, armazenamento, internet/limites de conta, classes de compatibilidade, recuperação e como contribuir. Não declarar macOS/Linux, assinatura do instalador ou integração externa validada sem evidência.
- [ ] Executar suíte, build, QA da janela, integração real e dist:win. Inspecionar também a janela do aplicativo empacotado; registrar comandos, resultados e hashes em docs/VALIDATION.md. Fazer revisão final independente conforme executing-plans; corrigir problemas críticos e importantes com teste que falha primeiro. Commit: build: package Windows app and document verified workflows.
- [ ] Publicar os commits na main e conferir que a árvore local corresponde à remota. Credenciais do Git local podem precisar de login; a integração GitHub autorizada permite publicar os mesmos arquivos/árvore quando o transporte local não estiver autenticado. Não fazer force push.

## Fontes e conferências para execução

- [Codex: execução não interativa](https://learn.chatgpt.com/docs/non-interactive-mode).
- [Codex: configurações e flags de ferramentas](https://learn.chatgpt.com/docs/config-file/config-reference).
- [Codex: manifests e marketplaces locais](https://developers.openai.com/plugins/build/plugins).
- [Electron: isolamento de contextos](https://www.electronjs.org/docs/latest/tutorial/context-isolation).
- [Electron: segurança e validação IPC](https://www.electronjs.org/docs/latest/tutorial/security/).

Conferências locais: Node 24.21.0; npm 11.19.0; Codex CLI 0.157.1 autenticado com ChatGPT. A ajuda confirma marketplace add --json, plugin add --json e plugin list --marketplace --json. Estes dados descrevem esta máquina; a aplicação precisa diagnosticar cada ambiente.
