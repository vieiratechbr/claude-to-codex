# Contribuir

Use Node 24, Git e Windows para reproduzir a validação. Execute `npm ci`, `npm run typecheck`, `npm test` e `npm run build`. Para integrações nativas, instale Codex compatível e execute `npm run test:desktop` e `npm run test:codex-local`. Nunca use o CODEX_HOME pessoal como destino de fixtures.

Crie primeiro um teste que reproduza o comportamento desejado ou a falha. Fixtures devem ser artificiais, identificadas e sem credenciais/dados pessoais. Preserve bytes dos recursos, atribuição e licença. Um recurso essencial sem equivalente comprovado deve produzir impedimento.

O processo principal controla downloads, persistência, processos e instalação. A janela usa DTOs por ponte com métodos definidos, sem Node ou IPC genérico. Não construa comandos de shell com entrada da origem nem execute código importado para inventariar/converter.

Documente novos adaptadores e casos malformados. Alterações de recuperação exigem regressões de concorrência, mudança externa e integridade. Atualize VALIDATION.md apenas com resultados observados.

O mantenedor trabalha na main por decisão explícita. Contribuições externas podem ser propostas por pull request e devem passar pela CI. Não faça force push.
