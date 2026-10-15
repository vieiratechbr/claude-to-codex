# Claude to Codex

Aplicativo Windows com janela própria para importar skills e plugins do **Claude Code**, adaptar componentes compatíveis e instalá-los no **Codex instalado na sua máquina**.

Cole um link do GitHub, selecione os componentes, revise os arquivos e instale. Inclui histórico local, comparação com a origem, exportação ZIP, atualização, remoção e recuperação. A instalação usa os comandos oficiais de plugins e o catálogo local do Codex.

**Beta pública 0.3.0-beta.1 — em testes, ainda não estável.** Reúne as skills selecionadas em uma instalação, cria uma chamada para escolher e combinar as adequadas à tarefa e mostra chamadas copiáveis no Histórico. Inclui novo visual do instalador, link do projeto e opção **Apoiar github**. Consulte [compatibilidade](docs/COMPATIBILITY.md) e [validação](docs/VALIDATION.md).

**[Baixar beta para Windows x64 — v0.3.0-beta.1](https://github.com/vieiratechbr/claude-to-codex/releases/download/v0.3.0-beta.1/Claude-to-Codex-0.3.0-beta.1-Windows-x64-Setup.exe)**

Download direto, sem precisar compilar ou acessar artifacts de CI. A [release v0.3.0-beta.1](https://github.com/vieiratechbr/claude-to-codex/releases/tag/v0.3.0-beta.1) inclui requisitos, notas e [checksum SHA-256](https://github.com/vieiratechbr/claude-to-codex/releases/download/v0.3.0-beta.1/SHA256SUMS.txt). Instalador por usuário, sem assinatura digital. [Ver todas as versões](https://github.com/vieiratechbr/claude-to-codex/releases).

![Janela do aplicativo](docs/images/application.png)

## Requisitos

- Windows x64; validação realizada no Windows 11.
- Git disponível. O aplicativo detecta o [Git for Windows](https://git-scm.com/downloads/win) nas instalações comuns por máquina/usuário e o Git do runtime principal do Codex, mesmo fora do PATH. Se nenhum estiver disponível, instale o Git for Windows e reabra o aplicativo.
- Codex com executável nativo e suporte a `plugin marketplace add`, `plugin add`, `plugin remove` e `plugin list --json`. A tela **Ambiente** verifica os recursos e permite selecionar `codex.exe` fora do PATH.
- Login no Codex para conversão assistida: `codex login`. O aplicativo reutiliza a autenticação oficial, sem pedir chave de API separada.
- Internet para baixar repositórios e usar o modelo. Repositórios privados dependem das credenciais Git já configuradas na máquina.

O instalador inclui o runtime do aplicativo. Não inclui Git, Codex ou dependências dos plugins importados.

A tela final mantém **Iniciar o aplicativo** e oferece **Apoiar github**, desmarcado inicialmente. Ao marcar o apoio e concluir, o instalador abre [o repositório do projeto](https://github.com/vieiratechbr/claude-to-codex) no navegador. O link também pode ser aberto diretamente nessa tela; deixar uma estrela é uma ação manual no GitHub.

## Executar e empacotar

Pelo código-fonte, com Node.js 24 ou superior:

```powershell
git clone https://github.com/vieiratechbr/claude-to-codex.git
cd claude-to-codex
npm ci
npm run build
npm start
```

No PowerShell, use `npm.cmd` se a política bloquear `npm.ps1`.

```powershell
npm run dist:win
```

Saída: `release/Claude-to-Codex-0.3.0-beta.1-Windows-x64-Setup.exe`. A publicação promove o artifact de uma verificação Windows aprovada, sem recompilar durante a publicação. Consulte as evidências em [VALIDATION.md](docs/VALIDATION.md). macOS e Linux ainda não foram validados.

## Usar

1. Abra o aplicativo e confira **Ambiente**.
2. Cole uma URL de repositório, como `https://github.com/anthropics/skills`. Para escolher branch/commit ou pasta, abra **Opções avançadas** e preencha os campos separados, em vez de colar um link `tree/`.
3. Clique em **Analisar repositório**. Os objetos Git são lidos sem executar scripts, checkout ou filtros da origem.
4. As skills encontradas já vêm selecionadas, com **Instalar como pacote** marcado. Um conjunto de várias skills vira uma instalação e recebe uma chamada como `$autor-repositorio`. Você pode retirar skills da seleção ou desmarcar o agrupamento para instalar individualmente. Selecionar um plugin completo desmarca suas skills internas. A conversão assistida envia instruções e referências ao Codex; desative-a para usar apenas os adaptadores locais.
5. Revise impedimentos, avisos e arquivos. Os impedimentos mostram a skill ou o arquivo afetado. Use **Escolher skills separadamente** para rever um pacote com várias skills, ou exporte um ZIP para inspeção externa.
6. Clique em **Instalar no Codex**. Cada pacote reconhecido passa a mostrar **Instalado no Codex**. A última etapa indica conclusão quando todos os pacotes desta conversão estão instalados. Abra uma nova conversa ou reinicie o Codex para carregar as alterações.

Exemplo verificado: `https://github.com/anthropics/skills`, pasta `skills/frontend-design`; a revisão exata está em [VALIDATION.md](docs/VALIDATION.md). Revise instruções e recursos de terceiros antes de usá-los.

Para **UI UX Pro Max**, use `https://github.com/nextlevelbuilder/ui-ux-pro-max-skill`, analise o repositório e marque **Skill: ui-ux-pro-max**. Você pode selecionar a principal entre as sete skills sem informar uma pasta. O campo **Opções avançadas → Pasta** continua disponível para importações específicas. A principal passou na conversão, instalação isolada e buscas de design, acessibilidade e React; isso não comprova os workflows das outras seis skills. Detalhes e revisão testada estão em [VALIDATION.md](docs/VALIDATION.md).

Após instalar, use **Verificar instalação** na revisão ou no **Histórico**. O diagnóstico confere reconhecimento e ativação no CLI, origem gerenciada, versão e hashes dos arquivos no cache nativo; verifica Python 3 quando há scripts Python. O painel oferece um prompt para copiar e testar na sua sessão do Codex. Não executa scripts importados nem testa conexões MCP.

No **Histórico**, abra uma conversão, prepare uma atualização para revisão, remova uma instalação gerenciada ou recupere uma operação. Uma origem fixada em commit continua fixada nas atualizações. Ao voltar à seleção de um pacote antigo, o aplicativo recupera a origem daquela conversão.

O **Histórico** e a revisão mostram a chamada anunciada em cada SKILL.md, com **Copiar**. Nos conjuntos, a chamada do pacote fica em destaque; as individuais ficam em uma lista expansível. Exemplo: `$autor-repositorio Crie um formulário acessível`. A skill de entrada consulta o catálogo, lê e combina as skills pertinentes e informa quais escolheu. Depois de instalar, abra uma nova conversa no Codex e selecione a skill sugerida ao digitar `$`.

Na atualização de um pacote que incluiu todas as skills, novas skills encontradas na origem também entram na revisão. Uma seleção parcial mantém os componentes escolhidos; se algum mudou de localização, será necessária nova análise. O agrupamento preserva impedimentos de compatibilidade. Plugins completos diferentes devem ser convertidos separadamente; para juntar skills deles, selecione suas skills internas.

O aplicativo consulta as releases públicas ao abrir e em **Ambiente → Consultar atualizações**, incluindo betas. Quando existe uma versão Windows mais recente, **Abrir download** abre o link do instalador no navegador. A atualização é manual; falhas nessa consulta não bloqueiam a conversão.

## Dados, conta e recuperação

Dados ficam em `%APPDATA%/Claude to Codex`. O destino Codex usa `CODEX_HOME` ou `~/.codex`. Para um perfil alternativo do aplicativo, defina `CLAUDE_TO_CODEX_HOME` com caminho absoluto antes de abri-lo.

A conversão assistida usa `codex exec`, schema, sandbox de leitura e ferramentas desativadas. Não materializa código da origem no workspace do modelo. Além da skill ativa, envia até 16 trechos de recursos textuais relevantes, limitados a 24 KiB por trecho e 128 KiB no total, e um inventário limitado de caminhos. Esse contexto é somente leitura: o modelo pode editar apenas a skill ativa. Depende de rede, disponibilidade e limites da conta Codex.

A consulta de atualizações usa a API pública de releases deste projeto, sem autenticação GitHub e sem enviar os dados das skills. Aceita links HTTPS de download e notas do próprio repositório.

O catálogo gerenciado chama-se `claude-to-codex-local`. A ferramenta registra snapshots da configuração e do catálogo envolvidos. Recuperação compara o estado atual com o registrado; mudança externa gera conflito e preserva os arquivos atuais. Não apague os dados com recuperação pendente. **Limpar downloads** remove clones temporários e mantém histórico e recuperação.

Uma instalação reconhecida não comprova funcionamento dos scripts, MCPs ou integrações externas da skill. Eles podem exigir software, autorização e configuração próprios. Licenças das origens continuam aplicáveis.

## Verificação e contribuição

```powershell
npm run typecheck
npm test
npm run build
npm run test:desktop
npm run test:codex-local
npm run dist:win
npm run test:packaged
```

Testes de instalação usam `CODEX_HOME` temporário. Testes comuns não exigem login nem rede. Veja [contribuição](docs/CONTRIBUTING.md), [arquitetura](docs/superpowers/specs/2026-10-13-claude-to-codex-design.md) e [plano](docs/superpowers/plans/2026-10-13-claude-to-codex.md). O mantenedor trabalha diretamente na **main**.

O teste opcional `npm run test:ui-ux-pro-max` usa a revisão fixada do repositório `nextlevelbuilder/ui-ux-pro-max-skill`, seleciona a principal pela interface, usa rede e sua conta Codex para adaptação. Instala somente em um perfil temporário, verifica a instalação e depois executa os scripts revisados de busca no cache nativo com consultas de teste. Requer Python 3 no PATH, ou `C2C_QA_PYTHON` com o caminho do executável. O relatório fica em `.cache/uipro-assisted-*/report.json`. Use `C2C_QA_SCOPE=repository` para testar o pacote inteiro e `C2C_QA_SHOW_WINDOW=1` para acompanhar a janela e salvar screenshots. A skill importada também requer Python no computador de quem a utilizar.

## Licença e referências

O código do aplicativo é distribuído sob a [licença MIT](LICENSE). Recursos importados mantêm suas licenças originais; a MIT do aplicativo não altera a licença dos plugins e skills convertidos. Dependências têm licenças próprias incluídas no pacote.

- [Plugins do Codex](https://developers.openai.com/plugins/build/plugins)
- [Execução não interativa](https://learn.chatgpt.com/docs/non-interactive-mode)
- [Plugins do Claude Code](https://code.claude.com/docs/en/plugins-reference)

Projeto independente, sem afiliação oficial com Anthropic ou OpenAI. Consulte [identificação visual e marcas](docs/BRANDING.md).
