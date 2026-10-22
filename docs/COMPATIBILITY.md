# Compatibilidade 0.3.x

| Origem | Resultado | Limite |
| --- | --- | --- |
| SKILL.md com YAML | Skill em plugin local | Nome/descrição normalizados; corpo e recursos portáveis preservados |
| .claude-plugin/plugin.json | .codex-plugin/plugin.json | Campos ativos desconhecidos bloqueiam instalação |
| Vários plugins/skills e marketplace local | Seleção explícita e composição de manifests | Fontes externas aparecem bloqueadas para importação separada |
| Skills ativas dentro de plugin | Escolhas individuais, com recursos e referências necessários | A seleção individual não herda silenciosamente hooks/MCP do plugin; dependências de componentes não selecionados podem bloquear |
| Conjunto de skills selecionadas | Uma instalação com skill de entrada e catálogo | Escolhe e combina conforme a tarefa; nomes individuais repetidos no pacote bloqueiam |
| Diretórios customizados | Recursos remapeados | Caminhos perigosos e arquivos ausentes recusados |
| Commands Markdown/inline | Skills invocáveis | Sintaxe de slash commands não é garantida |
| Agents Markdown | Skills com aviso | Não equivale a um subagente autônomo |
| Ferramentas/variáveis/argumentos Claude | Adaptação assistida e revisão | Políticas e injeção dinâmica sem equivalente bloqueiam |
| MCP stdio/HTTP | Configuração no plugin | Credenciais/runtime e conexão externa não verificados |
| MCP SSE/variáveis Claude ou user_config | Bloqueado | Exige adaptação fora do conversor atual |
| Hooks Claude | Bloqueado | Sem equivalência demonstrada, não ativa hooks Codex |
| user-invocable: true | Chamada explícita por `$skill` | user-invocable: false continua bloqueado; não há política equivalente verificada para ocultar somente a chamada manual |
| disable-model-invocation: true | agents/openai.yaml com allow_implicit_invocation: false | A chamada geral do pacote não autoriza executar essa skill; requer a chamada individual explícita |
| model / allowed-tools | Preferências históricas preservadas, com avisos | Usa o modelo e as permissões da sessão Codex; não concede aprovações automáticas |
| context / hooks / disallowed-tools e campos ativos desconhecidos | Bloqueado | Não simula isolamento, hooks ou restrições de ferramentas |
| Scripts/binários/referências | Arquivos preservados | Nunca executados para analisar/converter; requerem dependências e revisão para uso |
| Submódulos/Git LFS | Impedimento explícito | Conteúdo externo não é adquirido automaticamente |
| Links simbólicos internos para arquivos | Conteúdo materializado | Resolve aliases sem criar links; destinos externos, ausentes, ciclos e links para diretórios são recusados |
| Traversal/dispositivos Windows/colisões de caixa | Recusado | Evita escapes e ambiguidades |

Limites do snapshot e cache de objetos: 20.000 arquivos, 2 MiB por arquivo e 64 MiB de conteúdo. Uma pasta selecionada limita a leitura dos blobs, incluindo licenças dos ancestrais e destinos de links. Clone e fetch usam história rasa; o filtro Git por tamanho não é um limite agregado de tráfego ou espaço do clone, e pode baixar recursos fora da pasta escolhida.

A adaptação assistida processa um documento operacional por chamada (entrada de skill ou dependência de instruções), com até 1 MiB de prompt e cinco minutos por chamada. O modelo devolve edições de trechos únicos da origem; edições ambíguas, sobrepostas ou em outro caminho são recusadas. Uma edição com trecho ambíguo ou ausente é descartada e recebe uma tentativa adicional com feedback, sem aplicar correspondência aproximada. Uma adaptação com sintaxe residual também recebe feedback; são no máximo duas tentativas por documento. Se continuar incompleta, a instalação é bloqueada e a skill aparece na mensagem. Avisos das duas tentativas são preservados. O conteúdo adaptado fica limitado a 2 MiB por documento, e a saída recebida, inclusive respostas inválidas, diagnósticos e propostas materializadas, conta no limite acumulado de 8 MiB. Uma falha de um documento não descarta adaptações válidas de outros. Falhas globais de login, cota ou configuração interrompem novas chamadas e identificam documentos pendentes; não liberam instalação. Cópias de templates e documentação inativa do repositório não são adaptadas como skills instaláveis.

O modelo também recebe contexto textual relevante preservado no pacote: referências, scripts e instruções auxiliares referenciadas. São no máximo 16 trechos de até 12 KiB, com orçamento total de 48 KiB. Documentos longos incluem início e final, com intervalos e omissões declarados; truncamentos, recursos indisponíveis e um inventário limitado são identificados no prompt. Binários e texto inválido são excluídos. O contexto não pode ser editado pelo modelo e não é executado. A presença de uma referência não confirma ferramentas ou provedores externos na sessão de destino.

A conversão não garante equivalência universal nem concede direitos de uso. O reconhecimento pelo CLI confirma o registro do pacote. O comportamento em uma tarefa real e cada integração MCP exigem validação própria.

**Verificar instalação** atua somente sobre instalações gerenciadas: confere o CLI, a origem, a versão e os arquivos esperados no cache nativo por SHA-256. Scripts Python geram uma busca de Python 3 com `--version`; os scripts importados não são executados. O prompt de teste usa o nome anunciado no YAML da skill. Este diagnóstico não confirma o funcionamento dos scripts ou a conexão de um MCP.

A consulta de versões inclui releases estáveis e betas públicas com um instalador Windows x64 válido. Compara versões SemVer e abre somente URLs validadas deste repositório; não instala atualizações automaticamente.

Links Markdown locais são resolvidos em relação ao documento; caminhos inline `references/`, `scripts/` e `assets/` usam a pasta da skill como base. Padrões dinâmicos exigem recursos correspondentes. Referências ausentes ou dependentes de componentes ativos não selecionados bloqueiam. Arquivos de projeto ou saídas declaradas explicitamente na origem geram avisos e exigem conferência durante o uso. Documentação inativa não bloqueia a conversão por conter exemplos de caminhos. Licenças e avisos ancestrais são preservados. Configurações de catálogo/ativação alteradas manualmente ou em formato não reconhecido podem exigir conferência manual antes de atualizar ou recuperar.

## Recursos compartilhados e Claude Code Game Studios

Referências reconhecidas a documentos, definições de especialistas e helpers fora da pasta da skill são preservadas em `source-context/`, com um mapa por skill. Catálogos de testes incluem suas especificações existentes e dependências transitivas; valores relativos têm uma resolução explícita por catálogo. Não ativam agentes, hooks nem permissões. Dependências obrigatórias ausentes e recursos externos continuam bloqueados. Há limite de 1024 dependências por skill.

Helpers shell com âncoras reconhecidas recebem raízes separadas de projeto e recursos. O runner gerado requer Python 3 e GNU Bash verificado, confere registro e SHA-256, recebe argumentos literais e executa no projeto selecionado. Pode localizar o Git incluído no Codex; `bash` no PATH não é obrigatório. Âncoras desconhecidas não são liberadas automaticamente. O código da origem não é executado durante download, inventário ou conversão. Testes optativos posteriores executam somente os helpers convertidos e revisados em projetos descartáveis.

Configurações, saídas, catálogos mutáveis e instruções do projeto pertencem ao projeto em uso. Cópias instaladas são baselines somente leitura. Uma manutenção precisa de uma cópia de trabalho aprovada, com leituras, atualizações, reteste e reversão vinculados à mesma cópia. Escritas pendentes no pacote instalado bloqueiam a conversão, inclusive depois da adaptação assistida.

As perguntas preservam alternativas, resposta livre, modos e consentimento real. Acompanhamento de trabalho usa checkpoints; porcentagens de contexto não são inventadas. Revisão independente exige delegação efetiva com contexto apropriado ou entrega explícita a uma nova conversa com os artefatos. Uma instrução em prosa não comprova isolamento.

Especialistas preservados geram bindings e TOMLs inativos em `codex-compat/`. Preloads vinculam chamada, recurso, hash e política manual. No CLI 0.157.1, o registro explícito `agents.<nome>.config_file` com o mecanismo v1 demonstrou aplicação das instruções e remoção efetiva das ferramentas shell de um papel; a simples cópia para `.codex/agents/` não demonstrou descoberta. A interface v2 não seleciona esse papel por `agent_type`. O guia gerado fornece o procedimento de registro para uma sessão CLI aprovada e exige descoberta, máscaras, recursos e preloads efetivos antes da fase dependente. Não modifica agentes ou configuração pessoais durante a conversão. Memória de projeto usa checkpoint privado aprovado; worktree exige criação e conferência reais no projeto do usuário. Aliases de modelo e `maxTurns` permanecem como proveniência, sem promessa de identidade de modelo, custo ou limite rígido equivalente.

A conversão assistida usa `CODEX_HOME` e `CODEX_SQLITE_HOME` temporários, sem carregar configuração, AGENTS.md, skills ou plugins pessoais. Reutiliza a autenticação oficial disponível: um cache `auth.json` regular é copiado opacamente e removido no encerramento; credenciais não são incluídas nos relatórios ou pacotes. O login original não é sobrescrito. Credenciais disponíveis somente no keyring não são exportadas. Consulte a [autenticação oficial do Codex](https://learn.chatgpt.com/docs/auth).

A revisão fixada `be8993bbc5a1f016bc770b2846ce06272d284526` de Donchitos/Claude-Code-Game-Studios contém 74 skills, 49 especialistas e 122 especificações declaradas. A validação completa e seus resultados estão em [VALIDATION.md](VALIDATION.md); o teste reproduzível está em [GAME-STUDIOS-QA.md](GAME-STUDIOS-QA.md). Instalação e listagem não substituem a execução de uma tarefa real de cada engine.

Semântica dos campos da origem: [documentação Claude Code](https://code.claude.com/docs/en/skills). Política nativa de chamada: [documentação de skills do Codex](https://learn.chatgpt.com/docs/build-skills).

## Escopo dos recursos preservados

O pacote registra `codex-compat/resource-roles.json`. Apenas as skills selecionadas e seu fechamento operacional são tratados como instruções a converter; índices com famílias de revisões incluem os arquivos concretos aplicáveis. Guias administrativos, configurações históricas do host e documentação não utilizada permanecem como proveniência. Preservar um documento não exige reproduzir cada integração histórica da plataforma de origem. Componentes nativos explicitamente selecionados e funções obrigatórias de uma skill continuam sujeitos à verificação de compatibilidade.

Catálogos e suas especificações são dados de avaliação, interpretados por `codex-compat/evaluation.md`. Casos negativos não viram recursos obrigatórios. Predicados específicos da origem exigem tradução para controles reais do destino; proveniência não comprova isolamento, aprovação ou delegação. Falta de capacidade necessária resulta em bloqueado/não avaliado, sem inventar testes bem-sucedidos. Catálogo, resultados, rubricas e templates vivos pertencem a um fork aprovado no projeto, com leituras e alterações vinculadas à mesma cópia e recuperação.

Helpers de validação e restauração exigem chamada explícita no uso, com registro, hash, entrada e código de retorno conferidos; hooks não são ativados automaticamente. Estado e checkpoints são lidos de volta antes de relatá-los. Um rodapé nativo ou porcentagem de contexto só é anunciado quando há integração e telemetria efetivamente verificadas.
