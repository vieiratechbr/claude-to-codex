# Validação 0.1.0

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

A CI está configurada; o resultado remoto precisa ser verificado após publicação. Geração do NSIS e abertura do executável empacotado são verificações separadas da instalação pelo assistente NSIS, que não foi executado na máquina pessoal. macOS/Linux e assinatura de código não foram validados.

## Revisão independente

Uma revisão independente identificou nove falhas, corrigidas antes da publicação: alteração externa durante falha/recuperação, colisões após remapeamento, hooks/políticas em frontmatter, referências compartilhadas e avisos de licença, manifests de marketplace, aquisição explícita de tags, caminhos de skills ausentes, sintaxe Claude e achados externos de componentes não selecionados. Regressões reproduziram as falhas antes das correções; a suíte completa e o ciclo real de instalação permaneceram verdes. As fixtures de configuração passaram a simular tabelas TOML escritas pelo CLI real, em vez de comentários artificiais.

Executável empacotado: `npm run test:packaged` passou com perfil temporário do aplicativo, renderer sem Node, ponte disponível e `app.isPackaged = true`. O arquivo ASAR não inclui a fixture de testes.

Instalador final: SHA-256 `075ccef1c16683ee3db1302253174b866c7a55254e121287b7e916b48b18d8a1`. Estado Authenticode: `NotSigned`.
