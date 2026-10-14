# Beta: seleção, compatibilidade, verificação e atualização

Escopo solicitado e autorizado pelo mantenedor em 14/10/2026: implementar os cinco itens sugeridos após o teste real da UI UX Pro Max. Público: usuários Windows que colam links do GitHub e querem instalar componentes compatíveis no Codex local.

## Resultado esperado

1. Um plugin com várias skills oferece seleção individual das skills ativas, sem exigir conhecer a pasta. O plugin completo continua sendo uma opção explícita. Seleções sobrepostas são recusadas no backend e evitadas na interface.
2. A revisão prioriza impedimentos, identifica a skill/arquivo afetado, separa avisos e permite voltar à escolha de skills. Bloqueios não são convertidos em avisos para facilitar instalação.
3. A adaptação recebe contexto relevante preservado, além da skill editável: referências, scripts textuais diretamente relacionados e definições de skills auxiliares. Contexto é dado não confiável, somente para leitura, com limites por arquivo, total e quantidade. Apenas a skill originalmente enviada pode ser editada. Recursos omitidos aparecem explicitamente como incompletos.
4. Verificar instalação é diagnóstico local: reconhecimento e ativação pelo CLI, integridade dos arquivos no cache nativo e disponibilidade de Python quando há scripts .py. Não executa scripts importados nem ativa integrações. Mostra resultados e um prompt copiável para teste funcional em nova conversa.
5. Consultar atualizações usa somente as releases públicas deste repositório, incluindo betas. Compara versões semanticamente, ignora drafts e exige download Windows x64 da mesma release. Falha de rede não bloqueia conversão. O botão abre somente um endereço validado do repositório no navegador, sem baixar/executar ou instalar automaticamente.

## Compatibilidade e limites

- Branch main; sem branches/worktrees/force push. Instalações existentes mantêm identidade e recuperação.
- Skills internas vêm apenas do layout ativo do plugin; templates e outros SKILL.md inativos não viram escolhas instaláveis.
- Uma skill isolada não herda automaticamente hooks/MCP/políticas do plugin completo. Dependências necessárias permanecem impedimentos ou requisitos explícitos.
- Contexto semântico: no máximo 16 arquivos, 24 KiB por trecho e 128 KiB no total por skill; inventário textual limitado. Continua o limite de prompt de 1 MiB, duas tentativas e orçamento de resposta de 8 MiB.
- Verificação lê exclusivamente instalações gerenciadas e arquivos contidos no cache nativo. Configuração pessoal não é reescrita pelo diagnóstico.
- Dados/bounds das releases são validados. Sem tokens GitHub, telemetria ou updater automático.
- Versão alvo: 0.2.0-beta.1. Validação é específica desta beta; não promete conversão universal nem funcionamento de integrações externas.

## Interface

Manter a identidade visual atual. Seleção explicita plugin completo e suas skills; selecionar uma opção exclui sua contraparte sobreposta. A revisão apresenta resumo dos impedimentos com caminhos e uma ação para escolher skills separadamente. Verificação disponível após instalação e no Histórico. Atualização aparece como aviso discreto e pode ser consultada novamente no Ambiente.

## Evidência de conclusão

Regressões de inventário e conversão isolada; seleção sem sobreposição; contexto delimitado e sem permissão para editar auxiliares; arquivos faltantes/modificados e plugin desativado na verificação; versões/release URLs/rede na atualização. Testes desktop do fluxo novo, Codex nativo em perfil temporário, build Windows/NSIS e janela empacotada. Teste do repositório UI UX Pro Max pela seleção individual. Publicar somente artifact de CI verificado, com download e checksum conferidos.
