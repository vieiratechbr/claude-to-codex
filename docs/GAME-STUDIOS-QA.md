# Teste da coleção Claude Code Game Studios

Origem fixada: [Donchitos/Claude-Code-Game-Studios, be8993b](https://github.com/Donchitos/Claude-Code-Game-Studios/tree/be8993bbc5a1f016bc770b2846ce06272d284526). Esta revisão contém 585 arquivos, 74 skills e 49 definições de especialistas. Fixar a revisão permite distinguir regressões do conversor de mudanças posteriores na origem.

## Reproduzir a conversão

Com Node.js 24+, dependências do projeto e Git disponíveis:

```powershell
npm ci
npm run test:game-studios
```

O comando baixa objetos Git e converte todas as skills em um pacote. Não executa código importado, não instala plugins e não altera o projeto de um jogo. A conversão local pode terminar com impedimentos semânticos reais; o comando retorna código 1 e grava os motivos.

Para também adaptar os documentos que exigem o modelo, usando o login oficial e a disponibilidade da conta Codex:

```powershell
npm run test:game-studios -- --assist
```

A pasta de resultados aparece no terminal: `.cache/game-studios-qa-<id>/`. Contém `snapshot.json`, `bundle.json` e `report.json`. Os arquivos do pacote são dados; nenhum helper é executado pelo teste. As chamadas assistidas usam um perfil temporário, ferramentas desativadas e credencial oficial temporária quando disponível; a credencial é removida ao encerrar. Login armazenado somente no keyring pode exigir configuração adicional do login oficial no ambiente isolado.

Para reaproveitar os dados da mesma revisão, sem novo download:

```powershell
npm run test:game-studios -- --snapshot "<resultado anterior>/snapshot.json" --assist
```

Se uma rodada for interrompida, retome na mesma pasta para reutilizar as adaptações já aprovadas:

```powershell
npm run test:game-studios -- --snapshot "<resultado anterior>/snapshot.json" --assist --resume "<resultado anterior>"
```

A retomada compara o conteúdo de origem, as dependências completas, o contexto e a política de conversão. O texto salvo passa novamente pelos validadores atuais antes de ser usado; respostas com impedimentos não são aprovadas pelo cache. Mudanças nesses dados exigem nova adaptação. As chamadas usam esforço de raciocínio baixo para as edições restritas, mantendo as verificações funcionais e de integridade. Falha de login ou limite de uso interrompe as chamadas seguintes sem descartar os arquivos já validados.

Para conferir um pacote já convertido, sem novas chamadas ao modelo:

```powershell
npm run test:game-studios -- --snapshot "<resultado anterior>/snapshot.json" --bundle "<resultado anterior>/bundle.json"
```

O relatório exige as 74 chamadas individuais e uma chamada geral, todas as políticas de chamada manual declaradas na revisão de origem preservadas, ausência de nomes repetidos, referências locais presentes, hashes dos helpers e bindings íntegros, preloads coerentes e nenhum impedimento de instalação. Não trata um pacote bloqueado como aprovado. O hash da configuração pessoal é comparado antes e depois; nenhuma restauração é aplicada sobre alterações externas.

## O que cada verificação demonstra

| Verificação | Demonstra | Limite |
| --- | --- | --- |
| Conversão das 74 skills | Presença das chamadas, recursos, políticas e contratos convertidos | Não executa 74 tarefas de um jogo real |
| Helpers convertidos em fixtures | Leitura do projeto correto, argumentos, saídas e códigos de retorno | Não ativa hooks automaticamente |
| Godot headless em projeto descartável | Checker externo com script válido, erro de sintaxe, arquivo ausente, autoload e classe global | Não valida Unity, Unreal ou todos os projetos Godot |
| Instalação em `CODEX_HOME` descartável | Registro, ativação, listagem nativa, hashes e remoção do pacote | Não configura especialistas no projeto pessoal |
| Máscara de um especialista em provedor localhost | Registro explícito e redução efetiva de ferramentas no CLI testado | Não comprova toda allowlist, isolamento de sistema operacional ou descoberta automática no aplicativo |

Os recursos instalados são somente leitura. Configurações, artefatos, instruções e checkpoints vivos pertencem ao projeto selecionado. Python 3 e um GNU Bash verificado são requisitos dos helpers shell; o runner aceita o Git incluído no runtime do Codex, sem depender de `bash` no PATH.

Especialistas exigem o procedimento de `codex-compat/specialists.md`: registro suportado no runtime, instruções completas, preloads, máscara efetiva, acesso aos artefatos e, quando requerido, worktree real. Copiar um TOML não comprova descoberta. Se um requisito não puder ser atendido, a fase dependente deve parar com o progresso salvo.

Os scanners auxiliares que interpretam pastas e metadados exclusivos do Claude retornam `Observations: not run (...)` ou `Compatibility: not run (...)`, com código 2 e procedimento de auditoria nativa. Esse fallback é permitido pelo workflow original e não aprova nenhum controle. A auditoria usa os caminhos realmente anunciados pelo Codex, os bindings e contagens explícitas; uma pasta legada vazia não comprova compatibilidade.

Resultados efetivamente obtidos e versões publicadas ficam em [VALIDATION.md](VALIDATION.md). O estado beta permanece separado da aprovação de um teste específico.

Para testar outra revisão sem acompanhar uma branch que muda durante a execução, informe o SHA completo. Exemplo da revisão conferida em 20/10/2026:

```powershell
npm run test:game-studios -- --revision 05ad7c8a5b8aa2aa86bbd3439ae7cf7295cac418 --assist
```

Use o mesmo `--revision` ao retomar uma rodada dessa revisão. A localização do catálogo e o número de especificações esperadas vêm do snapshot original.
