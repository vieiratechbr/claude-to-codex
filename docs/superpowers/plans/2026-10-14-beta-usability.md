# Implementação da beta 0.2.0-beta.1

Especificação: ../specs/2026-10-14-beta-usability-design.md. Execução autorizada nesta conversa, diretamente na main. Base: ae534fa722163c41e44582a12b08b6e4682e8768.

## 1. Skills internas

Adicionar testes que falhem para plugin com skills declaradas, recursos compartilhados, templates inativos e seleção parent/child sobreposta. Atualizar inventory.ts, metadados parentPluginId em contratos/API e guarda de convertComponents. Manter os arquivos do plugin completo; a skill filha contém seus recursos e referências necessárias. Preservar identidade de importações antigas por pasta. Implementar seleção na interface após integração dos contratos.

## 2. Contexto semântico

Testar inclusão de referência relevante, auxiliar e script; exclusão de binários/arquivos não relacionados; truncamento, orçamento, quantidade e rejeição de edição contextual. Implementar módulo de seleção de contexto e integrar no adaptWithCodex. Não executar código ou ampliar ferramentas do modelo. Preservar o schema de edições e o orçamento existente.

## 3. Verificação local

Testar diagnóstico somente de instalação gerenciada, plugin ausente/desativado, arquivos modificados/ausentes, dependência Python e contenção de caminhos. Usar o CLI oficial e hashes esperados do bundle para o cache nativo; acrescentar diagnóstico Python sem executar scripts. Integrar AppService, API, IPC, preload e painel com prompt copiável. Testar em perfil Codex temporário.

## 4. Atualizações

Testar comparação semântica de stable/beta, drafts, assets ausentes, domínio/caminho inesperado, JSON grande/malformado e erro de rede. Implementar consulta pública limitada e botão para abrir URL validada. Expor API/IPC e integrar aviso e consulta no Ambiente. Fixtures evitam rede na suíte comum.

## 5. Interface e integração

Testar pela janela: selecionar skills dentro do plugin, evitar sobreposição, converter e instalar somente a principal, revisão com impedimentos em destaque, diagnóstico pós-instalação, prompt funcional, consulta/aviso de atualização. Manter navegação por teclado, contraste e layout mínimo. Alterar versão para 0.2.0-beta.1 e atualizar README, compatibilidade e evidências reais.

## 6. Entrega

Executar typecheck, suíte completa, Codex nativo isolado, desktop, NSIS e janela empacotada. Revisão independente do diff completo; corrigir achados materiais com regressões. Commits por etapa na main, publicação por API GitHub com lease (sem force push), CI Windows e release prerelease do artifact verificado. Conferir download público e SHA-256, registrar evidências. Nenhuma instalação de teste no perfil pessoal.
