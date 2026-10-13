# Validação

Os registros iniciais abaixo correspondem à versão 0.1.0. A atualização visual 0.1.1 está registrada na última seção.

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
