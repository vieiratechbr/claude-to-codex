# Compatibilidade 0.2.0-beta.1

| Origem | Resultado | Limite |
| --- | --- | --- |
| SKILL.md com YAML | Skill em plugin local | Nome/descrição normalizados; corpo e recursos portáveis preservados |
| .claude-plugin/plugin.json | .codex-plugin/plugin.json | Campos ativos desconhecidos bloqueiam instalação |
| Vários plugins/skills e marketplace local | Seleção explícita e composição de manifests | Fontes externas aparecem bloqueadas para importação separada |
| Skills ativas dentro de plugin | Escolhas individuais, com recursos e referências necessários | A seleção individual não herda silenciosamente hooks/MCP do plugin; dependências de componentes não selecionados podem bloquear |
| Diretórios customizados | Recursos remapeados | Caminhos perigosos e arquivos ausentes recusados |
| Commands Markdown/inline | Skills invocáveis | Sintaxe de slash commands não é garantida |
| Agents Markdown | Skills com aviso | Não equivale a um subagente autônomo |
| Ferramentas/variáveis/argumentos Claude | Adaptação assistida e revisão | Políticas e injeção dinâmica sem equivalente bloqueiam |
| MCP stdio/HTTP | Configuração no plugin | Credenciais/runtime e conexão externa não verificados |
| MCP SSE/variáveis Claude ou user_config | Bloqueado | Exige adaptação fora do conversor atual |
| Hooks Claude | Bloqueado | Sem equivalência demonstrada, não ativa hooks Codex |
| allowed-tools/context/disable-model-invocation | Bloqueado | Não simula políticas da origem |
| Scripts/binários/referências | Arquivos preservados | Nunca executados para analisar/converter; requerem dependências e revisão para uso |
| Submódulos/Git LFS | Impedimento explícito | Conteúdo externo não é adquirido automaticamente |
| Links simbólicos internos para arquivos | Conteúdo materializado | Resolve aliases sem criar links; destinos externos, ausentes, ciclos e links para diretórios são recusados |
| Traversal/dispositivos Windows/colisões de caixa | Recusado | Evita escapes e ambiguidades |

Limites do snapshot e cache de objetos: 20.000 arquivos, 2 MiB por arquivo e 64 MiB de conteúdo. Uma pasta selecionada limita a leitura dos blobs, incluindo licenças dos ancestrais e destinos de links. Clone e fetch usam história rasa; o filtro Git por tamanho não é um limite agregado de tráfego ou espaço do clone, e pode baixar recursos fora da pasta escolhida.

A adaptação assistida processa uma skill ativa por chamada, com até 1 MiB de prompt e cinco minutos por chamada. O modelo devolve edições de trechos únicos da origem; edições ambíguas, sobrepostas ou em outro caminho são recusadas. Uma adaptação com sintaxe residual recebe uma tentativa adicional com feedback da validação; se continuar incompleta, a instalação é bloqueada e a skill aparece na mensagem. Avisos das duas tentativas são preservados. O conteúdo adaptado fica limitado a 2 MiB por skill, e todas as propostas, incluindo diagnósticos e tentativas incompletas, contam no limite acumulado de 8 MiB. Cópias de templates e documentação inativa do repositório não são adaptadas como skills instaláveis.

O modelo também recebe contexto textual relevante preservado no pacote: referências, scripts e instruções auxiliares referenciadas. São no máximo 16 trechos de até 24 KiB, com orçamento total de 128 KiB. Truncamentos, recursos indisponíveis e um inventário limitado são declarados no prompt. Binários e texto inválido são excluídos. O contexto não pode ser editado pelo modelo e não é executado. A presença de uma referência não confirma ferramentas ou provedores externos na sessão de destino.

A conversão não garante equivalência universal nem concede direitos de uso. O reconhecimento pelo CLI confirma o registro do pacote. O comportamento em uma tarefa real e cada integração MCP exigem validação própria.

**Verificar instalação** atua somente sobre instalações gerenciadas: confere o CLI, a origem, a versão e os arquivos esperados no cache nativo por SHA-256. Scripts Python geram uma busca de Python 3 com `--version`; os scripts importados não são executados. O prompt de teste usa o nome anunciado no YAML da skill. Este diagnóstico não confirma o funcionamento dos scripts ou a conexão de um MCP.

A consulta de versões inclui releases estáveis e betas públicas com um instalador Windows x64 válido. Compara versões SemVer e abre somente URLs validadas deste repositório; não instala atualizações automaticamente.

Links Markdown locais são resolvidos em relação ao documento; caminhos inline `references/`, `scripts/` e `assets/` usam a pasta da skill como base. Padrões dinâmicos exigem recursos correspondentes. Referências ausentes ou dependentes de componentes ativos não selecionados bloqueiam. Arquivos de projeto ou saídas declaradas explicitamente na origem geram avisos e exigem conferência durante o uso. Documentação inativa não bloqueia a conversão por conter exemplos de caminhos. Licenças e avisos ancestrais são preservados. Configurações de catálogo/ativação alteradas manualmente ou em formato não reconhecido podem exigir conferência manual antes de atualizar ou recuperar.
