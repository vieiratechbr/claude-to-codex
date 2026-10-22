# Validação

Os registros abaixo são históricos por versão. A beta 0.2.0-beta.1 acrescenta seleção de skills internas, contexto de referências, diagnóstico da instalação e consulta de releases; suas evidências estão ao final.

Conferência local em 13/10/2026: Windows 11 x64 build 26200, Node 24.21.0, npm 11.19.0, Codex CLI 0.157.1, Electron 44.7.0. Estes resultados descrevem esta máquina; cada instalação passa pelo diagnóstico.

| Conferência | Resultado |
| --- | --- |
| npm run typecheck | Passou |
| npm test | 53 testes passaram; integração nativa separada por opção |
| npm run test:desktop | Janela real, URL inválida, análise/seleção/revisão, texto hostil escapado, renderer sem Node e instalação real isolada passaram |
| npm run test:codex-local | Catálogo, instalação, atualização na mesma versão, recuperação e remoção passaram; config.toml pessoal permaneceu byte a byte igual |
| npm run dist:win | Instalador NSIS x64 gerado |
| npm audit / npm audit --omit=dev | Zero vulnerabilidades registradas na data da conferência |

@electron/get 5.1.0 é fixado por override para retirar a dependência vulnerável sprintf-js. O empacotamento é conferido com essa resolução. O instalador não tem assinatura Authenticode; logs da etapa de signing não confirmam assinatura válida.

## Repositório real

Origem: [anthropics/skills](https://github.com/anthropics/skills), pasta `skills/frontend-design`, commit `dbd4588f9e1033efb41dad4bef2f7947c8993d44`. SKILL.md e LICENSE.txt adquiridos por objetos Git, convertidos e instalados com home temporário. O CLI confirmou `anthropics-frontend-design-c94428f3@claude-to-codex-local`.

SHA-256 da licença preservada: `0d542e0c8804e39aa7f37eb00da5a762149dc682d7829451287e11b938e94594`.

Conversão assistida adicional: fixture artificial de saudação mencionando Claude Code/AskUserQuestion enviada ao Codex autenticado, com ferramentas desabilitadas e schema. Retornou pergunta na conversa com fallback quando request_user_input_async não existe. Não executou ferramentas e manteve o caminho permitido. Isso valida o canal assistido, não todos os conteúdos possíveis.

## Limites das evidências

Instalações foram verificadas em perfis temporários. Nenhum plugin foi instalado no Codex pessoal durante os testes. Não foram executados scripts importados nem validados MCPs de terceiros, edição de vídeo ou tarefas finais de cada skill.

A CI Windows também passou, conforme a execução registrada abaixo. Geração do NSIS e abertura do executável empacotado são verificações separadas da instalação pelo assistente NSIS, que não foi executado na máquina pessoal. macOS/Linux e assinatura de código não foram validados.

## Revisão independente

Uma revisão independente identificou nove falhas, corrigidas antes da publicação: alteração externa durante falha/recuperação, colisões após remapeamento, hooks/políticas em frontmatter, referências compartilhadas e avisos de licença, manifests de marketplace, aquisição explícita de tags, caminhos de skills ausentes, sintaxe Claude e achados externos de componentes não selecionados. Regressões reproduziram as falhas antes das correções; a suíte completa e o ciclo real de instalação permaneceram verdes. As fixtures de configuração passaram a simular tabelas TOML escritas pelo CLI real, em vez de comentários artificiais.

Executável empacotado: `npm run test:packaged` passou com perfil temporário do aplicativo, renderer sem Node, ponte disponível e `app.isPackaged = true`. O arquivo ASAR não inclui a fixture de testes.

Instalador local: SHA-256 `edf8e1b71dcef1309f3da1623227ef017fb8bf4e3f0be76681e77eda3cb7294c`. Estado Authenticode: `NotSigned`.

## GitHub Actions

[Execução 38362744659](https://github.com/vieiratechbr/claude-to-codex/actions/runs/38362744659), commit `e3a4fb3c3432ae189984d608e9feff5c8cdd9174`: **success**. Passaram npm ci, typecheck, 53 testes, ciclo nativo isolado, build, janela desktop, NSIS, janela empacotada e upload do instalador. O pacote é gerado com `--publish never`, sem exigir token de publicação de releases.

A diferença de identidade dos caminhos Windows foi reproduzida com mudança de caixa e corrigida usando o caminho real do filesystem; o servidor também confirmou o ciclo completo. Configurações de outras origens continuam recusadas.

Artifact `Windows-installer`, ID `11795841214`: ZIP SHA-256 `2446866a0a7de6c30139da96e31c771cb7651daa4082d2f6a1c088e66ba3e427`. O hash do ZIP remoto e o hash do instalador local descrevem arquivos diferentes; builds NSIS podem conter timestamps diferentes. As alterações seguintes nesta documentação não modificam o aplicativo verificado.

## Distribuição com licença MIT

MIT adicionada no commit `37608d63933ec70a6c2f1c2e26b6bfd0da8a0136`, com metadados atualizados e inclusão de LICENSE no aplicativo empacotado. Conferência local: o arquivo LICENSE extraído do ASAR corresponde byte a byte ao arquivo do projeto, e package.json declara MIT. Licenças das origens convertidas permanecem separadas.

[Execução Windows 38415504430](https://github.com/vieiratechbr/claude-to-codex/actions/runs/38415504430): **success**, incluindo testes, integração nativa, janela, instalador e artifact `Windows-installer`, ID `11823652866`. ZIP remoto SHA-256: `acb6d6b0010f421278460a286be3645e187645b435dad187be3deea8d54956f5`.

Instalador local com MIT: `release/mit/Claude-to-Codex-0.1.0-Windows-x64-Setup.exe`, SHA-256 `b4da10f80456153e28cb1302466db27e6617f4530966064b62ed9fac757f6f23`. Esta geração foi feita em diretório separado para preservar a aplicação aberta.

## Interface 0.1.1

Atualização visual em 13/10/2026: representações vetoriais de Clawd e Codex, tipografia maior, quatro etapas com indicação de progresso e campos de referência/pasta recolhidos em **Opções avançadas**. Marcas e referências estão descritas em [BRANDING.md](BRANDING.md).

Conferências locais realizadas nesta versão:

- `npm run typecheck`, `npm test` (53 testes) e `npm run build` passaram.
- `npm run test:desktop` passou com URL inválida, análise, seleção, revisão e instalação real no Codex isolado. Os valores dos campos avançados persistem ao recolher/reabrir; a etapa final e o botão mudam para instalado após reconhecimento. Conteúdo da origem continua escapado e o renderer permanece sem acesso ao Node.
- Revisão visual em 1320 × 900 e 900 × 680. Na janela menor, o botão principal permanece visível e não existe rolagem horizontal.
- NSIS x64 gerado e `npm run test:packaged` passou usando `C2C_PACKAGED_EXE` para selecionar a nova geração em diretório separado. Verificados `app.isPackaged`, versão 0.1.1, perfil temporário, ponte disponível e abertura/recolhimento das opções com o teclado.
- LICENSE do ASAR corresponde byte a byte ao projeto; package.json declara MIT; fixture de testes ausente do pacote.

Instalador local: `release/design/Claude-to-Codex-0.1.1-Windows-x64-Setup.exe`, SHA-256 `3773058aa9900f8fd7eda2bcdf510a2981813ef33118e10d890d80c1d52e0418`. Authenticode: `NotSigned`. O assistente de instalação NSIS não foi executado na máquina pessoal.

[Execução Windows 38419589295](https://github.com/vieiratechbr/claude-to-codex/actions/runs/38419589295), commit `d77134de2e6d88961402feddc9e1c0fe8d0a06e3`: **success**. Passaram 53 testes, ciclo nativo isolado, fluxo desktop atualizado, NSIS e janela empacotada 0.1.1. Artifact `Windows-installer`, ID `11825547851`; ZIP remoto SHA-256 `18086c543d556a6541359a0fb9264e4098047790ab10c873b802bb5ab8336d72`. O ZIP remoto e o instalador local são arquivos distintos. A atualização deste registro e do link de download não altera o aplicativo verificado.

## Release pública v0.1.1

[Release v0.1.1](https://github.com/vieiratechbr/claude-to-codex/releases/tag/v0.1.1), ID `411896505`, originalmente publicada como última versão, com instalador Windows x64 e `SHA256SUMS.txt`. Agora marcada como pré-release da fase beta, preservando IDs, arquivos e hashes dos assets. Tag no commit `ab341acd082eec8d4dfb3a9d0aebd8c10fdfb930`; a diferença para o build validado é apenas README e VALIDATION.md.

A [publicação 38432542471](https://github.com/vieiratechbr/claude-to-codex/actions/runs/38432542471) conferiu o build e o digest do artifact antes de promover seu instalador, gerou o checksum, anexou os arquivos ao rascunho e publicou a release. Não recompilou nem alterou o instalador.

O download público sem autenticação foi conferido. SHA-256 do instalador publicado: `8ea2cea76312695fc4a1f415a827f752b29224f729c6316624d70c3a4ba10075`, igual ao arquivo de checksums e ao digest do asset no GitHub. Authenticode do arquivo baixado: `NotSigned`. Este instalador vem da CI; a geração local separada tem outro hash.

## Beta 0.1.2-beta.1 — UI UX Pro Max

Origem: [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/tree/7246805992a42b7bba37d4cac83b01416f0c6c44), revisão `7246805992a42b7bba37d4cac83b01416f0c6c44`, licença MIT. Teste em Windows 11 x64 e Codex CLI 0.157.1.

**Skill principal aprovada:** pasta `.claude/skills/ui-ux-pro-max`. O teste percorreu a interface e IPC de produção, aquisição Git real, adaptação com Codex autenticado e instalação com os comandos oficiais em um `CODEX_HOME` temporário. A autenticação utilizada foi a existente; a configuração pessoal permaneceu com o mesmo SHA-256 antes/depois.

- Análise: 10,7 segundos; adaptação: 44,2 segundos nesta execução. São medições locais, não garantias de prazo ou consumo.
- Pacote convertido: 76 arquivos; zero impedimentos. O modelo substituiu a variável de raiz do Claude pela resolução da pasta do SKILL.md instalado, sem inventar uma variável nativa Codex.
- Instalação reconhecida pelo CLI. Recursos e licença: 72 arquivos conferidos por SHA-256 entre origem, conversão e instalação.
- Os scripts Python foram revisados antes do teste e executados somente na cópia convertida e instalada. Download, inventário e conversão não executaram a origem. As buscas usaram `-B`, sem persistência de resultados nem geração de cache Python.

| Busca real | Resultado |
| --- | --- |
| `SaaS dashboard analytics --design-system --json` | Data-Dense Dashboard, cor primária `#1E40AF`, fontes Fira Code/Fira Sans |
| `keyboard accessibility focus --domain ux --json` | 3 recomendações estruturadas |
| `responsive form state accessibility --stack react --json` | 3 recomendações estruturadas |

**Pacote completo bloqueado:** 689 arquivos na origem, um plugin com sete skills; a conversão gerou 688 arquivos e não instalou o pacote. As definições dos agentes externos `ui-ux-designer` e `frontend-developer` não estão na origem. A adaptação também reportou workflow de slash command não confirmado e ferramentas de tarefas indisponíveis no contexto restrito do conversor. Esse resultado conservador não prova ausência dessas capacidades no Codex: referências auxiliares são preservadas, mas apenas SKILL.md é enviado ao modelo. A aprovação da pasta principal não comprova todos os workflows das outras seis skills.

Correções reproduzidas e testadas: aquisição em lote, links internos com orçamento e contenção, marketplace `./`, referências ancoradas na skill, padrões com candidatos, distinção entre assets obrigatórios e saídas do projeto, exclusão de documentação inativa, adaptação por trechos, correção limitada com feedback, preservação de avisos, separação prosa/comandos e identidade por pasta com manutenção de instalações anteriores. Uma medição da leitura local dos 689 arquivos caiu de aproximadamente 73 segundos para 1 segundo. Clone/fetch rasos evitam o histórico integral; o orçamento agregado não limita o tráfego Git.

Verificação local: `typecheck`, **93 testes automatizados**, ciclo nativo de instalação/atualização/recuperação/remoção e fluxo desktop com origem artificial passaram. O teste nativo é opt-in na suíte comum e foi executado separadamente. O teste real é `npm run test:ui-ux-pro-max`; relatório desta rodada em `.cache/uipro-assisted-QqrIbk/report.json` (ignorado pelo Git). O assistente NSIS não é executado sobre a instalação pessoal; a janela empacotada tem teste separado. macOS/Linux e os outros scripts/integrações das seis skills auxiliares não foram validados.

NSIS local: `release/beta-verified/Claude-to-Codex-0.1.2-beta.1-Windows-x64-Setup.exe`, 113.128.345 bytes, SHA-256 `a6af25bbad710cfa1e6eaa62a8bdf1747218a625b23accf166e93c11f664fd2c`, `NotSigned`. `test:packaged` passou, confirmando versão beta, perfil temporário, ponte isolada e controles de opções avançadas. A licença MIT está no ASAR; fixtures e ferramentas de QA ficam fora do aplicativo distribuído. O instalador da CI poderá ter outro hash por ser uma geração separada.

### Publicação e confirmação nativa

Os mesmos 72 arquivos também foram conferidos no cache nativo criado pelo Codex, e as três buscas foram repetidas nessa cópia com resultados válidos. Registro `nextlevelbuilder-ui-ux-pro-max-16aa3cea@claude-to-codex-local`: `installed: true`, `enabled: true`. Relatório adicional local: `.cache/uipro-assisted-QqrIbk/native-cache-check.json`.

[Verificação Windows 38480138034](https://github.com/vieiratechbr/claude-to-codex/actions/runs/38480138034), commit `35e52f4448c39c23abf4b574a17e53a1a2c6ff0a`: **success**. Artifact `Windows-installer`, ID `11856073475`, digest ZIP `sha256:ae4b314f67ddb4264aea86335687f59e2faf5c498e5ed216cd1370e65cff16f1`.

[Publicação 38480775527](https://github.com/vieiratechbr/claude-to-codex/actions/runs/38480775527): **success**. Promoveu o artifact verificado, conferiu que não havia mudanças de aplicação desde o build e publicou a [release v0.1.2-beta.1](https://github.com/vieiratechbr/claude-to-codex/releases/tag/v0.1.2-beta.1), ID `412176058`, `draft: false`, `prerelease: true`. Tag no commit `5b89a3d0c96d8cfef5cb0041cc22c4b1507ebe42`; a diferença para o build é README e o workflow de publicação. A [verificação desse commit](https://github.com/vieiratechbr/claude-to-codex/actions/runs/38480775564) também passou.

Download público sem autenticação confirmado: instalador com 113.128.396 bytes, SHA-256 `e47c833dcc041dd2a22dedce1bc3e1a707bebdcb35ae4796408b07e420d3e0fd`, igual ao `SHA256SUMS.txt` e ao digest do asset GitHub `638485741`. Authenticode: `NotSigned`. O instalador publicado e a geração local têm hashes distintos. A licença do ASAR corresponde byte a byte à MIT do projeto.

## Beta 0.1.2-beta.2 — detecção do Git no Windows

Erro relatado na janela instalada: “Git não encontrado”. Nesta máquina, o Git existe apenas no runtime principal do Codex e não está no PATH persistente do usuário ou da máquina. O terminal do Codex acrescenta esse caminho ao próprio ambiente; o aplicativo iniciado pelo Windows não o recebia.

Reprodução na janela empacotada da beta.1, com PATH limitado a `Windows/System32`: diagnóstico sem Git. Na beta.2, sob o mesmo PATH, a janela encontrou o Git do runtime principal, executou `--version` com resultado `git version 2.53.0.windows.3` e concluiu a análise pela interface do repositório UI UX Pro Max, pasta `.claude/skills/ui-ux-pro-max`, commit `7246805992a42b7bba37d4cac83b01416f0c6c44`. Relatórios locais: `.cache/git-windows-DRse9T/report.json` (reprodução) e `.cache/git-windows-s8WoIp/report.json` (correção). A operação foi somente de análise; nenhuma nova instalação foi feita no perfil pessoal.

Seis testes de arquivos reais em pastas temporárias cobrem as instalações comuns por máquina e usuário, o runtime principal do Codex, a prioridade explícita/PATH, rejeição de diretórios/atalhos e ausência de Git. Quatro falharam na versão anterior e todos passaram com a correção. Verificação local: tipos, **99 testes automatizados**, ciclo nativo isolado, desktop com fixture e janela empacotada passaram. O teste empacotado agora remove o Git do PATH e exige sua versão real e o estado “Git disponível”.

Instalador local `release/beta-git-fix/Claude-to-Codex-0.1.2-beta.2-Windows-x64-Setup.exe`: 113.128.521 bytes, SHA-256 `af568349e38dcb935919dcdefe0abb56c9764fee36e9d5b7ec3bc615fade405f`, Authenticode `NotSigned`. A descoberta não instala dependências nem altera o PATH do Windows. Se nenhuma instalação conhecida existe, a operação orienta instalar o Git for Windows e reabrir o aplicativo. Permanecem os limites de compatibilidade registrados na beta.1.

[Verificação Windows 38497222095](https://github.com/vieiratechbr/claude-to-codex/actions/runs/38497222095), commit `24816b52e76a8c29325a22576357e7761dd9ca36`: **success**. Incluiu o teste empacotado sem Git no PATH. Artifact `Windows-installer`, ID `11864172888`, digest ZIP `sha256:f6eecdd031caa57f547229b802cd1a0ba016f9cdef479cbdc9682d22f1e859d4`. O workflow de publicação da beta.2 fixa esse build e exige que a aplicação permaneça idêntica; alterações de publicação são somente de documentação/workflow.

[Publicação 38497557897](https://github.com/vieiratechbr/claude-to-codex/actions/runs/38497557897): **success**. Release [v0.1.2-beta.2](https://github.com/vieiratechbr/claude-to-codex/releases/tag/v0.1.2-beta.2), ID `412260410`, `draft: false`, `prerelease: true`. Tag no commit `12d40d034c41ae1a91c8d977f89c8c19d36ce076`. As versões anteriores foram preservadas.

Download público sem autenticação confirmado: instalador com 113.128.495 bytes, SHA-256 `3788e64d311fd3b30e11a83ea548063fba5e11a93a961176a1f76acffa8de165`, igual ao `SHA256SUMS.txt` e ao digest do asset GitHub `638866323`; Authenticode `NotSigned`. Relatório local `.cache/download-beta2/report.json`. Esta é a geração da CI; o instalador local tem outro hash. O assistente de instalação não foi executado sobre o aplicativo pessoal.

## Beta 0.2.0-beta.1 — seleção e verificação

Conferência local em 14/10/2026: Windows 11 x64, Node 24.21.0, npm 11.19.0, Codex CLI 0.157.1, Electron 44.7.0 e Python 3.12.14 do runtime principal do Codex.

As cinco melhorias aprovadas foram implementadas: escolhas individuais de skills ativas de um plugin, impedimentos por arquivo com retorno à seleção, contexto relevante somente leitura na adaptação, diagnóstico nativo da instalação com prompt copiável e aviso de novas releases Windows. As configurações ativas do plugin completo continuam sujeitas à validação; a seleção individual informa quando não herda hooks/MCP do plugin.

Verificação local:

- `npm run typecheck` e `npm test`: passaram, com **142 testes** e um teste nativo opt-in executado separadamente.
- `npm run test:codex-local`: passou o ciclo isolado de catálogo, instalação, atualização, verificação do cache, recuperação e remoção. A configuração pessoal é capturada antes do diagnóstico e permaneceu byte a byte igual.
- `npm run test:desktop`: **três testes passaram**, com o empacotado opt-in separado. Cobrem fluxo antigo, seleção interna/impedimentos/instalação/diagnóstico e retorno do Histórico para a origem correta. Um teste precisou aguardar o estado inicial visível antes de preencher o link; a regressão de Histórico passou também em três repetições consecutivas.
- `npm run dist:win` e `npm run test:packaged`: NSIS gerado, executável empacotado 0.2.0-beta.1 aberto em perfil temporário, renderer sem Node, ponte isolada e Git detectado com PATH limitado a `Windows/System32`. Opções avançadas operáveis por teclado; sem rolagem horizontal na janela mínima. MIT do ASAR corresponde byte a byte à licença do projeto; fixtures, relatórios e scripts de QA não integram o aplicativo distribuído.
- Consulta real à API pública de releases: a produção identificou a beta.2 mais recente para uma versão antiga simulada, com URL exata do instalador deste projeto. As regressões cobrem ordem SemVer, betas, drafts, assets inválidos, URLs externas, limite de resposta e erro de rede. O aplicativo não instala atualizações automaticamente.

Instalador local anterior à correção de caminhos equivalentes: `release/beta-usability-final/Claude-to-Codex-0.2.0-beta.1-Windows-x64-Setup.exe`, 113.134.309 bytes, SHA-256 `dc6c45e4d5f36f55c06cea67c0b1358b9939f3884440a7f2a953e1fe0adbfb7b`, Authenticode `NotSigned`. O assistente NSIS não foi executado sobre a instalação pessoal. O download publicado é uma geração separada da CI.

### Teste real pela nova seleção

Origem UI UX Pro Max fixada em `7246805992a42b7bba37d4cac83b01416f0c6c44`. A interface apresentou **sete skills** e a principal foi escolhida sem preencher Pasta. O teste usou aquisição Git, IPC e adaptação assistida de produção, conta Codex autenticada e instalação em `CODEX_HOME` temporário.

Relatório concluído: `.cache/uipro-assisted-EZogok/report.json`, ignorado pelo Git. Análise de 11,1 segundos e adaptação de 43,5 segundos nesta máquina. Pacote com **75 arquivos**, zero impedimentos, **71 recursos/licença** comparados por SHA-256. A seleção evita uma cópia redundante da licença do pacote anteriormente importado por pasta; a licença original permanece preservada. A identidade gerenciada da principal permanece `nextlevelbuilder-ui-ux-pro-max-16aa3cea`.

**Verificar instalação** confirmou reconhecimento, ativação, origem gerenciada, todos os 75 arquivos esperados no cache nativo e Python 3.12.14. As três buscas revisadas foram executadas depois da instalação, nessa cópia nativa, com `-B`, sem persistência ou cache Python:

| Busca real | Resultado |
| --- | --- |
| `SaaS dashboard analytics --design-system --json` | Data-Dense Dashboard, primária `#1E40AF`, Fira Code/Fira Sans |
| `keyboard accessibility focus --domain ux --json` | 3 recomendações estruturadas |
| `responsive form state accessibility --stack react --json` | 3 recomendações estruturadas |

Na repetição sequencial, o SHA-256 da configuração pessoal permaneceu igual antes e nos cinco checkpoints: análise, conversão, instalação, verificação e buscas. A primeira execução, realizada em paralelo com outros diagnósticos nativos, passou na conversão, instalação, verificação e buscas, mas falhou na guarda do hash pessoal: `.cache/uipro-assisted-dCAEhP/report.json`. Não há evidência suficiente para atribuir aquela mudança a um processo específico; nenhum conteúdo pessoal foi revertido. A repetição sequencial e a guarda ampliada do teste nativo passaram. Os relatórios não armazenam o conteúdo da configuração pessoal.

### Revisão e limites

Revisão independente identificou quatro casos corrigidos com regressões: seleção da origem errada ao abrir outra conversão pelo Histórico, adaptação de um SKILL.md inativo dentro de assets, nome do prompt de teste diferente do nome anunciado no YAML e seleção de contexto auxiliar pelo nome anunciado. A releitura das correções não manteve achados críticos ou importantes.

A aprovação funcional continua restrita à principal e às três consultas executadas. O pacote completo das sete skills não foi revalidado funcionalmente nesta rodada. Contexto adicional não confirma ferramentas, agentes externos ou MCPs na sessão de destino. O diagnóstico da instalação é distinto de um teste funcional: não executa código importado e só compara os arquivos esperados, sem atestar arquivos adicionais criados depois pelo Codex. macOS/Linux, assinatura de código e o assistente de instalação NSIS permanecem sem validação.

A [primeira CI Windows 38511564539](https://github.com/vieiratechbr/claude-to-codex/actions/runs/38511564539), commit `22665952aba5632b082856372361a70d2f6382b3`, passou em tipos e 142 testes, mas falhou no diagnóstico nativo após instalar. Não gerou artifact. Foi reproduzida uma falha da comparação textual de caminhos equivalentes na origem gerenciada; o diagnóstico passou a reutilizar a resolução real do filesystem, já usada na recuperação. A regressão cobre um alias de diretório equivalente e uma origem ausente, sem alterar a contenção dos arquivos de cache. O teste nativo agora mostra os checks individuais quando falha, em vez de uma asserção booleana sem detalhes.

Após a correção, tipos, 142 testes, ciclo nativo isolado, build, três fluxos desktop e janela empacotada passaram novamente. Instalador local final: `release/beta-usability-canonical/Claude-to-Codex-0.2.0-beta.1-Windows-x64-Setup.exe`, 113.134.442 bytes, SHA-256 `1cc31e9f2a20877546bff6c71001ea6a3f5e2fb5607e633a009be429829e01b0`, Authenticode `NotSigned`. ASAR com MIT preservada e sem fixtures ou ferramentas de QA.

[Verificação Windows 38512075020](https://github.com/vieiratechbr/claude-to-codex/actions/runs/38512075020), commit `a7291bd13500ae27f4a13a230b2120d91e913728`: **success**. Passaram tipos, 142 testes, ciclo nativo isolado com diagnóstico dos arquivos, três fluxos desktop, NSIS e janela empacotada. Artifact `Windows-installer`, ID `11870636226`, digest ZIP `sha256:9d33dcebf65d9b940cb1c79a6d57857a5bd9c019653badee200c659ddfab3cb2`. O publisher da nova beta fixa este build e digest e exige aplicação idêntica antes de promover o artifact. A atualização deste registro, README e workflow não modifica a aplicação verificada.

### Release pública e download

[Publicação 38512551091](https://github.com/vieiratechbr/claude-to-codex/actions/runs/38512551091): **success**. Release [v0.2.0-beta.1](https://github.com/vieiratechbr/claude-to-codex/releases/tag/v0.2.0-beta.1), ID `412343220`, `draft: false`, `prerelease: true`. Tag no commit `b9a499a6f286f78fff94fbfe5a9949adfccf7f82`; a diferença para o build validado é apenas documentação e workflow. As versões anteriores e seus downloads foram preservados.

Download público sem autenticação confirmado: instalador com 113.134.308 bytes, SHA-256 `7a06253871c3b43904d9c273b9846c854fa27dc3aea6a9e80fb3b4a3ce145bd8`, igual ao `SHA256SUMS.txt` e ao digest do asset GitHub `639237652`; Authenticode `NotSigned`. Relatório local `.cache/download-beta-usability/report.json`. O instalador da CI e a geração local têm hashes diferentes. Nenhum instalador NSIS foi executado sobre o aplicativo pessoal.

A consulta de atualizações de produção foi repetida após publicar: detectou `0.2.0-beta.1` como disponível para `0.1.2-beta.2` e retornou estado atual para `0.2.0-beta.1`, com os links exatos da nova release e do instalador. São consultas públicas sem token; a beta anterior não possui este updater e precisa ser atualizada manualmente.

## Build intermediário 0.2.0-beta.2 — apresentação do instalador (não publicado)

Solicitação do mantenedor: melhorar o visual e, na conclusão, manter **Iniciar o aplicativo**, mostrar o link do projeto e acrescentar **Apoiar github**. O destino aprovado é `https://github.com/vieiratechbr/claude-to-codex`. Apoio desmarcado por padrão; marcar e concluir abre o navegador para essa página. Estrela e login permanecem ações manuais do usuário.

NSIS personalizado com ícone do cubo/seta, lateral baseada nos vetores já usados pelo aplicativo, cabeçalho próprio, fundo claro, fonte Segoe UI e textos em português. Usa os hooks oficiais do electron-builder e controles MUI nativos, preservando a função de iniciar o app e seu argumento de atualização. Identificador do aplicativo, instalação por usuário e ciclo de atualização não foram alterados.

Verificação local em 14/10/2026:

- Tipos e **142 testes** passaram; núcleo da conversão e instalação sem alterações funcionais nesta beta.
- `node scripts/check-installer-preview.mjs` compilou uma prévia das mesmas macros de boas-vindas/conclusão. Não tem payload, registros, atalhos ou instalação. A função de abertura é substituída por um log somente nessa fixture.
- Inspeção nativa confirmou leitura dos textos, link completo, ambas as caixas, **Iniciar o aplicativo** marcado e **Apoiar github** desmarcado. A conclusão no estado padrão escreveu somente `preview-app|` no log, sem URL GitHub: `.cache/installer-preview-jJTCHE/events.log`. Foi corrigida a codificação UTF-8 do título da fixture com BOM; a recompilação passou.
- A automação de janela foi interrompida pelo usuário com Esc antes do teste com apoio marcado; nenhum novo comando de mouse/teclado foi emitido por Computer Use depois da interrupção. Não há afirmação de teste interativo da abertura real do navegador ou instalação sobre o app pessoal. A CI compila a prévia sem executá-la.
- Build e NSIS final passaram. `release/installer-design-final/Claude-to-Codex-0.2.0-beta.2-Windows-x64-Setup.exe`, 113.282.517 bytes, SHA-256 `49dc8214dda5ab4fc7a4a207963fceb5a224560095e357694d8b7409237a53f6`, Authenticode `NotSigned`.

Os SVGs, BMPs e ícones estão em `build/installer`; sua geração não baixa fontes/imagens. A prévia e os scripts de desenvolvimento não são distribuídos no ASAR. O assistente NSIS não foi executado sobre a instalação pessoal. macOS/Linux e assinatura digital permanecem sem validação.

## Beta 0.3.0-beta.1 — chamadas e pacotes de skills

Conferência local em 14/10/2026. Incorpora o instalador acima, Histórico com chamadas copiáveis e agrupamento das skills selecionadas em uma instalação. O comportamento aprovado da entrada é escolher e combinar skills pertinentes à tarefa.

- Tipos e **150 testes** passaram. A origem artificial de 74 skills produziu um pacote com as 74 skills e uma entrada, preservando licença e referência cruzada. Há regressões para atualização com novas skills, seleção parcial, nomes YAML repetidos, nomes de pastas repetidos entre plugins, redução do conjunto para uma skill e registros antigos do Histórico.
- O ciclo com Codex real isolado passou: instalação de duas skills com entrada, verificação de hashes, atualização para três skills, recuperação da seleção anterior e remoção. A configuração pessoal foi capturada antes do diagnóstico e permaneceu igual.
- Quatro fluxos desktop passaram; o teste empacotado fica opt-in separado. O novo fluxo comprova seleção inicial de todas as skills, uma instalação, prompt com chamada do pacote e cópia da entrada e chamada individual no Histórico, sem rolagem horizontal a 900 pixels. Na fixture, a cópia escreve um arquivo temporário em vez de alterar a área de transferência pessoal.
- Avaliação independente da entrada gerada: para formulário acessível com validação TypeScript, leu catálogo e as duas skills pertinentes, combinou rótulos/foco/teclado com validação tipada e respeitou o pedido de não enviar dados. As skills de banco e vídeo não foram lidas. Exemplo avaliado conceitualmente, sem execução: `.cache/skill-package-forward`. Essa evidência não atesta cada skill externa.
- Revisão independente encontrou colisão de destinos entre pastas homônimas e perda da chamada após redução do conjunto. Ambas foram reproduzidas e corrigidas com regressões. A atualização preserva a entrada; um novo conflito de nome exige revisão da migração.

A sintaxe `$nome` é documentada no [App Server oficial](https://learn.chatgpt.com/docs/app-server). A exibição deriva do nome YAML instalado; para nomes presentes em plugins diferentes, selecione a sugestão correspondente do Codex. O nome não confirma execução funcional. O agrupamento mantém impedimentos, requisitos e permissões da origem. A publicação Windows e seu download serão registrados após a CI.

Build NSIS e janela empacotada passaram. Instalador local `release/Claude-to-Codex-0.3.0-beta.1-Windows-x64-Setup.exe`: 113.284.481 bytes, SHA-256 `2f418ce7ac0d7ad2b4b0b8bc85093de3c0fd13946599bfc2dba5343074a90d8d`, Authenticode `NotSigned`. ASAR com versão correta e MIT preservada; sem fixtures ou scripts de QA do projeto. A prévia nativa foi recompilada sem instalação. O teste interativo de apoio marcado continua incompleto após o cancelamento por Esc, conforme registro acima. Nenhum NSIS foi instalado sobre o app pessoal.

[Verificação Windows 38663375705](https://github.com/vieiratechbr/claude-to-codex/actions/runs/38663375705), commit `2aa0862fc6b78d19d0a341eaa5ba078d6a81d1b8`: **success**. Passaram tipos, 150 testes, ciclo nativo isolado, quatro fluxos desktop, NSIS, janela empacotada e compilação da prévia nativa sem executá-la. Artifact `Windows-installer`, ID `11939822452`, digest ZIP `sha256:3acf6528ad2ae1025d82f0e341ac11c4b6437207cdc0b8def24ac9e9cb47c865`. O publisher fixa build e digest e exige aplicação idêntica, incluindo os recursos de `build/installer`, antes de promover o artifact.

### Release e conferência pública

[Publicação 38663774167](https://github.com/vieiratechbr/claude-to-codex/actions/runs/38663774167): **success**. Release [v0.3.0-beta.1](https://github.com/vieiratechbr/claude-to-codex/releases/tag/v0.3.0-beta.1), ID `413317635`, `draft: false`, `prerelease: true`. Tag no commit `b2e47afd389029e0ab4bcb56a398645b7b36ef36`, com aplicação idêntica ao build aprovado. Releases e downloads anteriores preservados.

Download sem autenticação concluído: 113.284.534 bytes, SHA-256 `325dcad81505a4700a8436d7167a112a86012a648fc5c9fcc6af49cc2ca6e938`, igual ao `SHA256SUMS.txt` e ao digest do asset `642226332`. Authenticode `NotSigned`. Relatório local `.cache/download-package-beta/report.json`. O arquivo público veio da CI; seu hash difere da geração local.

A consulta de atualizações de produção identificou `0.3.0-beta.1` como disponível para `0.2.0-beta.1` e retornou estado atual para a própria `0.3.0-beta.1`, com URLs exatas da release e do instalador. Nenhum NSIS foi instalado sobre o aplicativo pessoal nesta rodada. A publicação mantém o estado beta e os limites funcionais documentados.

## Beta 0.3.0-beta.2 — conversão de políticas e contexto compartilhado

Conferência em 15/10/2026. Origem real [Donchitos/Claude-Code-Game-Studios](https://github.com/Donchitos/Claude-Code-Game-Studios), commit `be8993bbc5a1f016bc770b2846ce06272d284526`: 585 arquivos e 74 skills. A aquisição leu objetos Git; não executou scripts da origem.

- O inventário e a conversão estrutural de todas as 74 skills preservaram 399 arquivos, incluindo mapa por skill e recursos compartilhados. `model`, `allowed-tools` e `user-invocable: true` não geraram impedimentos indevidos. Oito referências de assets do projeto geraram avisos, sem fabricar arquivos. Dependências reais e a necessidade de adaptação assistida permaneceram bloqueadas.
- `estimate`: conversão local, instalação no Codex real em home temporário, reconhecimento, ativação, origem e três hashes conferidos. Remoção passou; configuração pessoal permaneceu idêntica nesse teste. Isso não testa uma estimativa de projeto real.
- `design-system`: adaptação assistida real, com ferramentas desabilitadas, não liberou instalação. Permaneceram requisitos de scripts dependentes da localização, widget estrito e medição de contexto, além de sintaxe residual. A coleção completa não foi submetida a 74 chamadas do modelo nem teve todos os workflows executados.
- Durante a chamada assistida da `design-system`, o monitor detectou diferença no hash da configuração pessoal enquanto outros processos estavam ativos. Não foi possível atribuir a alteração; nenhum backup foi aplicado sobre o estado atual. O teste nativo isolado e a rodada posterior da `estimate` confirmaram igualdade da configuração antes/depois. Não se afirma igualdade nessa chamada assistida específica.
- Política manual: Codex CLI real, home temporário e provedor HTTP em localhost com chave artificial, sem modelo externo. Sem `$skill`, a skill manual ficou fora das instruções; com chamada explícita, foi incluída. O teste encerra antes de geração. Uma avaliação independente da chamada geral leu gateway e catálogo e solicitou a chamada individual em vez de executar a skill manual; não escreveu arquivos.
- Revisão independente reproduziu e corrigiu problemas no mapa gerado, escopo de plugins, dependências transitivas obrigatórias, helpers `.gd` e scripts que derivam raiz da localização. Os oito testes específicos de contexto passaram. Exemplos opcionais não são promovidos a dependências obrigatórias.

Verificação local concluída em 16/10/2026: tipos, 172 testes da suíte, dois testes nativos opcionais, quatro fluxos desktop, build NSIS, janela empacotada e compilação da prévia nativa passaram. O ASAR declara `0.3.0-beta.2`, preserva a MIT e exclui fixtures e artefatos de desenvolvimento do projeto.

Instalador local `release/Claude-to-Codex-0.3.0-beta.2-Windows-x64-Setup.exe`: 113.287.295 bytes, SHA-256 `1a2d0096d981fbec8ddb4bdc6252c963f6811f1d605e2c512bd600e3b3ae84d5`, Authenticode `NotSigned`. Nenhum NSIS foi instalado sobre a aplicação pessoal. Scripts e integrações de terceiros exigem validação separada. Publicação Windows ainda pendente neste commit.

A primeira [CI desta correção, 38851532363](https://github.com/vieiratechbr/claude-to-codex/actions/runs/38851532363), passou nos tipos e 172 testes, mas falhou ao remover a pasta temporária do teste nativo de política (`EBUSY`). O teste agora aguarda o evento `close`, desabilita ferramentas desnecessárias ao provedor artificial e usa tentativas limitadas de remoção para bloqueios transitórios do Windows. A nova CI precisa passar antes da publicação. A alteração é no teste; o aplicativo não foi modificado nesta etapa.

[CI Windows 38851943204](https://github.com/vieiratechbr/claude-to-codex/actions/runs/38851943204), commit `b9e07cce8fe0b59df12e9faf7989e7ea5ae567c8`: **success**. Passaram tipos, 172 testes, dois testes nativos isolados, quatro fluxos desktop, NSIS, janela empacotada e compilação da prévia sem instalar. Artifact `Windows-installer`, ID `12025352614`, ZIP SHA-256 `00e1f0ada1740afb14e0070bc32fda6fc0250d8737813d666fc9866f66e96791`. O publisher desta beta fixa essa execução, commit, artifact e digest e exige igualdade dos arquivos do aplicativo antes de promover o instalador. A publicação e seu download serão conferidos após o workflow.

### Publicação e download da beta.2

[Publicação 38852388399](https://github.com/vieiratechbr/claude-to-codex/actions/runs/38852388399): **success**. [Release v0.3.0-beta.2](https://github.com/vieiratechbr/claude-to-codex/releases/tag/v0.3.0-beta.2), ID `414547537`, `draft: false`, `prerelease: true`, tag no commit `eaa266e35cdc635cf7c716f34f9634ba72394d4a`. O instalador foi promovido da CI aprovada, com os arquivos do aplicativo idênticos. Downloads anteriores preservados.

Download público sem autenticação: 113.287.320 bytes, SHA-256 `749b190cce476775d87ea9115dc4184f68bf6e4dfa20dc467ba03254fbeb3c08`, igual ao checksum publicado e ao digest do asset `646170912`. Authenticode `NotSigned`. O hash público descreve a geração da CI e difere do build local. Relatório local `.cache/download-v0.3.0-beta.2/report.json`.

A consulta de atualizações de produção retornou `available` para a `0.3.0-beta.1`, apontando exatamente para a nova release e seu instalador, e `current` para `0.3.0-beta.2`. A publicação mantém os limites de compatibilidade acima; não comprova o funcionamento das 74 skills do framework. Nenhuma instalação foi aplicada ao Codex ou ao aplicativo pessoal nesta rodada.


## Próxima beta — rodada completa de Game Studios (em validação)

Origem reconferida em 18/10/2026: `refs/heads/main` permanece em `be8993bbc5a1f016bc770b2846ce06272d284526`. O snapshot contém 585 arquivos, 74 skills, 49 especialistas e 122 especificações não vazias declaradas no catálogo de testes. A conversão local preservou 674 arquivos, incluindo essas 122 especificações e seus mapas. Isso demonstra aquisição e fechamento das dependências; os documentos semânticos pendentes ainda impedem a instalação até sua adaptação e revisão.

Os adaptadores locais separam recursos imutáveis e projeto real, convertem preparação dinâmica para uso explícito, preservam escolhas e consentimento, substituem acompanhamento de tarefas por checkpoints e não inventam telemetria. Manutenção exige fork aprovado no projeto. A revisão independente reproduziu e corrigiu caminhos Unicode/espaços, escrita de instruções por comandos alternativos, raízes de plugins em monorepo, preloads de especialistas e omissão das especificações do catálogo. A revisão de destinos mutáveis inclui o ciclo de leituras e atualizações do catálogo, não apenas uma advertência genérica.

Validação funcional dos helpers convertidos: 24 scripts passaram em GNU Bash `-n`, 23 tiveram ramos executados em fixtures descartáveis e 31 referências internas foram remapeadas. Foram conferidos resolução de configuração/precedência, diretório real do projeto, ADRs, estados de histórias, recibos, checkpoints, validações Git e operações de migração/rotação com preservação do legado. `notify.sh` não teve notificações visuais executadas; a finalização destrutiva da migração não foi executada. A árvore de recursos permaneceu idêntica por hash. O código original não foi executado durante aquisição ou conversão. Relatório local `.cache/studios-script-portability-qa.json`; SHA-256 do adaptador testado `ab7a74c6c07026717c1dc1e2874488ed1a78bd9f2fd1e9998e6c6bd976f0026b`.

Godot oficial portátil `4.7.2.stable.official.ed1daf0bf`, arquivo ZIP conferido por CRC e SHA-512 publicado. O checker convertido foi executado como recurso externo absoluto com projeto explícito: script válido, `class_name` e autoload passaram; sintaxe inválida e arquivo ausente retornaram erro; ausência de argumentos retornou uso. Cwd distinto e cwd do projeto funcionaram; hash do checker permaneceu igual. Relatório local `.cache/studios-godot-qa.json`. Não foram executados projetos Unity/Unreal completos.

O primeiro teste Godot criou a pasta de dados `AppData/Godot/app_userdata/C2C Isolated Checker QA` fora da cache do projeto. A revisão automática rejeitou sua remoção com “blocked by policy”; a remoção não foi contornada. Os testes posteriores redirecionaram seus diretórios temporários para a fixture. A pasta inicial pode permanecer.

Especialistas: teste nativo do Codex CLI 0.157.1 com provedor HTTP em localhost e credencial artificial demonstrou registro explícito v1 por `-c agents.<nome>.config_file`. O filho recebeu as instruções e não anunciou `exec_command` nem `write_stdin` com `features.shell_tool=false`, enquanto o pai conservou essas ferramentas. A descoberta por simples arquivo em `.codex/agents/` ou pela configuração do projeto não foi demonstrada; a API v2 não oferece `agent_type`. O guia gerado usa o registro explícito verificado e mantém preflights de máscaras, preloads, contexto independente e worktree. O teste não utilizou modelo externo, login real ou instalação pessoal. Evidência `.cache/native-role-oct18-1MBZ5p/report.json`.

A primeira rodada assistida de 18/10 parou por limite da conta após propostas para dois documentos. Configuração pessoal permaneceu igual. A correção posterior preserva propostas válidas ao interromper novas chamadas por falha global e identifica arquivos não processados. Nenhum pacote bloqueado foi instalado. O resultado final da rodada e a publicação precisam ser acrescentados após sua conclusão.

Reprodução: [GAME-STUDIOS-QA.md](GAME-STUDIOS-QA.md). O teste optativo confere as 75 chamadas (74 individuais e uma geral), quatro políticas manuais, hashes, dependências, preloads e especificações, sem executar código importado ou instalar plugins.

### Conferência de 20/10/2026 (ainda em validação)

A origem avançou para `05ad7c8a5b8aa2aa86bbd3439ae7cf7295cac418`: 638 arquivos, as mesmas 74 skills, 49 especialistas e 123 especificações não vazias, agora em `studio-tests/catalog.yaml`. O teste aceita `--revision` com SHA exato e deriva a localização e a quantidade das especificações do catálogo original, sem presumir a antiga pasta. O resultado desta revisão é separado do snapshot anterior.

Foram corrigidos falsos destinos de escrita em citações de formatos/templates e cópias de leitura, mantendo bloqueadas mutações posteriores do mesmo recurso. Exemplos cercados não fabricam links Markdown; o nome do produto de origem não é tratado como uma API, e operações incompatíveis na mesma linha continuam detectadas. O runner expõe o GNU Bash verificado a chamadas aninhadas, inclusive quando o runtime empacotado se chama `sh.exe`; um executável alternativo no PATH não recebe os argumentos.

Antes dessas últimas extensões, passaram tipos, 382 testes da suíte, dois testes nativos e quatro fluxos desktop. A janela empacotada e a compilação da prévia do instalador também passaram; a verificação empacotada agora compara a versão com o manifesto do projeto. Estes checks precisam ser repetidos no código final antes de publicar a beta.3. A rodada assistida e a instalação integral ainda estão pendentes.

Congelamento posterior de código em 20/10: tipos e **418 testes** passaram; os dois testes nativos isolados e os quatro fluxos desktop passaram novamente. Os 24 helpers da revisão original tiveram nova conferência de sintaxe, com 23 executados em fixtures, no SHA do adaptador acima. A revisão atual preserva os 43 shells efetivamente usados, todos registrados, e o leitor AWK compartilhado; o fechamento estático não deixou bloqueios de localização, dependências obrigatórias ausentes ou links locais quebrados. Seletor `--root` conflitante é recusado antes de ler ou escrever no projeto errado.

A classificação distingue instruções operacionais, 123 specs e catálogo como dados de avaliação, e documentação administrativa/histórica como proveniência. Índices de revisão incluem seus 28 gates concretos. O contrato de avaliação mantém predicados, casos negativos, métricas e estados bloqueado/não avaliado; catálogos e resultados vivos exigem fork aprovado no projeto com backups e reversão. Não comprova testes de um jogo real.

Falhas do CLI com código não zero agora conservam o erro JSON de stdout sem incluí-lo automaticamente na mensagem pública. Limite de conta ou falha global de descoberta interrompem novas chamadas e preservam pendências; não produzem uma sequência enganosa de erros por skill. Um probe isolado de 20/10 retornou `ok` e removeu a credencial temporária. A conversão assistida atual contém 20 documentos pendentes de adaptação/revisão; o pacote integral ainda não foi instalado nesta etapa.

### Conferência de 21/10/2026

Correções publicadas na main em `1d3bb7db8ebece989619039b187496690e7b8c62`. A [primeira CI, 39701082159](https://github.com/vieiratechbr/claude-to-codex/actions/runs/39701082159), passou nos tipos e falhou em 13 testes de scripts: a fixture fixava um runtime Bash existente somente na máquina de desenvolvimento. A descoberta dos testes agora verifica GNU Bash instalado ou override explícito e produz diagnóstico claro para pré-requisito ausente; nenhum teste foi ignorado para contornar a falha.

Foram reproduzidos e corrigidos seis falsos bloqueios de escrita nos operandos de execução do runner; destinos reais, comandos posteriores e modificações dos próprios helpers continuam bloqueados. Preparação dinâmica preserva exemplos literais Markdown. O contexto assistido inclui os contratos de runtime e avaliação antes de referências volumosas consumirem o limite. A configuração/leitura da referência de engine, permissão de execução, observação visual, shell MSYS e pseudocódigo conhecido de modos receberam procedimentos concretos de destino, mantendo as aprovações e condições de parada.

Tipos, **444 testes** e **dois testes nativos isolados** passaram no código conjunto. Os 24 helpers da revisão original passaram novamente na sintaxe, com 23 executados em fixtures e recursos instalados idênticos ao final. SHA-256 do adaptador desta rodada: `974fda274742402862d37e32703883901b0ce670475200d5680570296738de10`. O checker Godot da revisão atual é byte a byte idêntico ao já testado (`c009f12256161f64d0eaf031ddbcf177dec4b02eb8ff469ab7e6d12632705c5e`). Não se acrescenta alegação de execução Unity/Unreal.

A revisão atual declara cinco políticas manuais, incluindo `launch-checklist`; todas foram preservadas. A auditoria estrutural contém 75 chamadas, 49 especialistas e 123 specs, sem links locais ou hashes faltantes. Os dois scanners de formato Claude foram identificados estruturalmente e agora retornam o fallback opcional `not run`, com procedimento de observação nativa, em vez de aprovar pastas legadas vazias. A rodada assistida restante abrange dez documentos compartilhados. Instalação integral e publicação da beta.3 ainda dependem de seu resultado e da nova CI.

### Conferência de 22/10/2026

A [CI 39702077381](https://github.com/vieiratechbr/claude-to-codex/actions/runs/39702077381), commit `81ac2253882c1b09591057e63063880fdcd48fe9`, passou na suíte Windows completa, incluindo empacotamento. Antes da publicação, a revisão de uma conversão real encontrou perda de três itens de avaliação de agentes: a substituição de um parágrafo consumia itens Markdown seguintes. O matcher foi limitado ao próprio parágrafo, com regressões do trecho real para Test Cases, gates, regras 2/3/5, responsável obrigatório, condições FAIL e Protocol Compliance. O artefato daquela CI não foi publicado.

A conversão assistida recebe agora o escopo original dos componentes selecionados. Empacotar skills não seleciona integrações automáticas do host apenas por preservar suas descrições numa referência. Configurações mistas mantêm os modos e funções realmente exigidos; hooks selecionados e controles obrigatórios sem adaptação continuam bloqueantes. Sete regressões cobrem o escopo e sua transmissão sem omitir os bloqueios reais.

As regras de leitura usam o helper registrado, suas observações e o leitor efetivo antes do acesso. Equipes experimentais não adotadas permanecem distintas da delegação requerida pelas skills. Preferências de complexidade/modelo conservam tabela e atribuições, sem prometer aliases, custo ou contexto. A revisão independente dessas alterações não encontrou outro P1/P2. Tipos e **466 testes** passaram no código conjunto.

O `read-guard.sh` convertido da revisão atual passou em seis casos funcionais: LARGE antes de leitura integral, leitura delimitada, índice de seções sem cabeçalhos de exemplos cercados, override local desligado, limite inválido com fallback/proveniência e arquivo ausente. Todos os recursos do pacote permaneceram iguais por hash. Relatório `.cache/studios-read-guard-ZTgIBe/report.json`. Os 43 shells efetivamente usados já passaram em sintaxe/registro, em `.cache/studios-current-syntax-BpNDc7/report.json`; esses resultados não executam 74 tarefas de jogo.

A rodada anterior terminou com configuração pessoal igual e sem cópia temporária de `auth.json` restante. Sua tentativa de cancelamento e limpeza manual foi recusada pela revisão automática com “blocked by policy”; o fluxo normal encerrou e removeu as credenciais. A rodada corrigida tem sete documentos compartilhados para adaptação. Seu resultado, instalação integral e publicação precisam ser registrados após a conclusão.
