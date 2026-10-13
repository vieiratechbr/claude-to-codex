# Validação

Os registros iniciais correspondem à versão 0.1.0. A atualização visual 0.1.1 e a fase beta com repositórios reais 0.1.2-beta.1 estão registradas abaixo.

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
