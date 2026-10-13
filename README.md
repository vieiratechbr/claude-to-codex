# Claude to Codex

Aplicativo local com janela própria para converter plugins e skills do Claude Code, da Anthropic, e instalá-los no Codex presente na máquina do usuário.

O usuário informa um link do GitHub. A ferramenta identifica os componentes do repositório, adapta o que for necessário para o Codex e apresenta o resultado da conversão e da instalação.

> **Estado atual:** arquitetura aprovada e plano de implementação em revisão. Este repositório contém a documentação inicial; ainda não existe aplicativo executável, instalador ou versão publicada. As funcionalidades descritas abaixo são o escopo previsto.

## Experiência prevista

1. Abrir o aplicativo e verificar a instalação do Codex.
2. Colar o link de um repositório do GitHub.
3. Selecionar o plugin ou a skill quando houver vários no mesmo repositório.
4. Analisar e converter os componentes para o Codex.
5. Conferir as adaptações, dependências e eventuais limitações.
6. Instalar no Codex e verificar se a instalação foi reconhecida.

## Escopo

- Aplicativo de desktop com processamento e armazenamento locais.
- Integração com o Codex instalado, usando seus mecanismos de autenticação e instalação.
- Descoberta de skills, plugins e seus recursos associados em repositórios do Claude Code.
- Adaptação de instruções, manifests, referências a ferramentas e configurações.
- Preservação dos arquivos de apoio, autoria e licenças dos componentes de origem.
- Relatório por componente, incluindo os casos que exigem configuração ou não possuem equivalente funcional.
- Histórico local, diagnóstico, atualização e remoção das instalações gerenciadas pelo aplicativo.
- Backup e recuperação das alterações feitas durante a instalação.

A conversão será avaliada pelo comportamento preservado. Renomear arquivos ou substituir o nome de uma plataforma não basta para declarar compatibilidade.

## Integração proposta

O motor combinará regras para formatos conhecidos e o Codex instalado para adaptações que exigem interpretação. A proposta reutiliza a autenticação do próprio Codex e não exige uma chave de API separada para o aplicativo.

O aplicativo será local. Baixar repositórios e usar o modelo conectado ao Codex poderá exigir acesso à internet; execução local não significa funcionamento integralmente offline.

Detalhes e critérios de conclusão estão na [proposta de arquitetura](docs/superpowers/specs/2026-10-13-claude-to-codex-design.md).

O [plano de implementação](docs/superpowers/plans/2026-10-13-claude-to-codex.md) organiza a entrega em diagnóstico e leitura da origem, conversão, instalação recuperável, aplicativo desktop, interface e distribuição Windows.

## Desenvolvimento

Todo o trabalho deste projeto será realizado diretamente na branch **main**, conforme a decisão do mantenedor. Os commits devem representar etapas verificáveis e manter a documentação alinhada ao estado real do produto.

Instruções para executar, testar e empacotar o aplicativo serão adicionadas quando esses comandos existirem e forem verificados.

## Referências

- [Modo de execução não interativo do Codex](https://learn.chatgpt.com/docs/non-interactive-mode)
- [Empacotamento e instalação local de plugins do Codex](https://developers.openai.com/plugins/build/plugins)
- [Referência de manifests de plugins do Claude Code](https://code.claude.com/docs/en/plugins-reference)

Projeto independente, sem afiliação oficial com a Anthropic ou a OpenAI.
