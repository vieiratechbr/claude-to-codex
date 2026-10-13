# Claude to Codex — proposta de arquitetura

Data: 13 de outubro de 2026.

Estado: proposta para revisão do mantenedor, antes da implementação.

## Objetivo e requisitos confirmados

Entregar um aplicativo local com janela própria. O usuário fornece o link de um GitHub contendo extensões do Claude Code; o aplicativo identifica os componentes, adapta-os para o Codex instalado e gerencia sua instalação. O repositório público deverá oferecer código, README, testes e distribuição utilizável por outras pessoas.

Repositório: https://github.com/vieiratechbr/claude-to-codex.

Todo o desenvolvimento e todos os commits ocorrerão diretamente na branch main. Não criar branches alternativas ou worktrees para este projeto.

## Abordagens consideradas

| Abordagem | Benefício | Limite |
| --- | --- | --- |
| Regras de conversão | Resultado previsível nos formatos conhecidos; não exige uma chamada ao modelo para cada componente. | Instruções dependentes do Claude Code podem exigir interpretação. |
| Conversão inteiramente pelo Codex | Flexibilidade para interpretar diferentes repositórios. | Mais chamadas ao modelo e menor previsibilidade na estrutura do pacote. |
| Regras combinadas com o Codex instalado | Mantém controle sobre arquivos, formatos e instalação, com interpretação quando necessário. | Requer separar claramente o que a aplicação valida do que o modelo propõe. |

Recomendação: regras combinadas com o Codex. O modelo propõe adaptações; a aplicação decide o que pode ser instalado por meio de validações independentes.

## Plataforma e tecnologia propostas

Aplicativo instalável com Electron, React e TypeScript. O processo principal cuida de arquivos, processos e instalação. A interface acessa operações específicas por uma ponte restrita, sem acesso direto ao sistema de arquivos ou a comandos de shell.

A primeira distribuição será validada no Windows. Manter o núcleo independente do sistema operacional para permitir versões futuras de macOS e Linux, sem declarar essas plataformas suportadas antes de testá-las.

Usar o Codex CLI presente na máquina, sem embutir uma cópia do Codex ou manipular seus tokens. Detectar o executável por PATH e locais conhecidos do aplicativo, permitindo também seleção manual. Verificar recursos por comandos de ajuda e versão, em vez de presumir que todos os usuários têm a mesma versão.

Reutilizar a autenticação disponível no Codex. Quando não houver sessão válida, orientar o login pelos meios oficiais. A ferramenta não terá um serviço hospedado próprio nem exigirá chave separada da API da OpenAI.

Processamento e histórico ficam locais. Download do GitHub e inferência com um modelo remoto continuam dependentes de rede e dos limites da conta do usuário.

## Fluxo do usuário

1. **Diagnóstico:** mostrar se Codex e Git estão disponíveis, se a autenticação funciona e se existe suporte à instalação de plugins.
2. **Origem:** receber URL de GitHub; permitir indicar uma referência e um subdiretório separadamente.
3. **Descoberta:** listar os componentes encontrados. Repositórios com vários plugins exigem seleção clara do que será convertido.
4. **Conversão:** exibir o andamento real e permitir cancelar. A conversão produz um pacote em uma área temporária do aplicativo.
5. **Revisão:** mostrar componentes convertidos, adaptações, dependências e impedimentos. O usuário pode inspecionar diferenças e exportar o pacote.
6. **Instalação:** o usuário aciona Instalar. O aplicativo preserva o estado anterior, instala o pacote e verifica o resultado.
7. **Histórico:** listar conversões e instalações com origem, revisão, destino, data e estado. Permitir atualizar, remover e restaurar operações gerenciadas.

A interface terá texto em português na primeira versão, estados compreensíveis e erros com próximos passos concretos. Dependências técnicas serão expostas apenas quando o usuário precisar agir.

## Limites dos componentes

| Componente | Responsabilidade |
| --- | --- |
| Interface desktop | Entrada da URL, seleção, progresso, revisão, instalação e histórico. |
| Diagnóstico do Codex | Descobrir executável, autenticação, recursos e destinos disponíveis. |
| Aquisição da origem | Validar URL, baixar a revisão solicitada e registrar o commit resolvido. |
| Inventário | Descobrir manifests, skills, comandos, agentes, MCP, hooks, scripts e referências. |
| Planejamento da conversão | Definir saída, adaptações e bloqueios por componente. |
| Adaptadores estruturais | Transformar formatos conhecidos e preservar recursos associados. |
| Adaptador do Codex | Solicitar adaptações sem conceder ao modelo controle sobre a instalação real. |
| Validação | Conferir estrutura, caminhos, dependências, referências e diferenças da saída. |
| Instalador | Fazer backup, instalar, verificar, remover e recuperar apenas alterações gerenciadas. |
| Histórico e proveniência | Registrar origem, hash, ações, resultado e versão dos adaptadores. |

O núcleo terá interfaces independentes da janela para testes, mas a primeira entrega é o aplicativo de desktop confirmado pelo usuário.

## Aquisição e inventário

Aceitar repositórios públicos e repositórios privados acessíveis pela autenticação já configurada no Git. Não coletar tokens em campos de URL nem salvar credenciais no histórico.

Clonar em diretório gerenciado, resolvendo a referência para um commit imutável. Não executar hooks, scripts de instalação, submódulos ou dependências da origem durante a análise. Identificar quando arquivos dependem de Git LFS ou de recursos externos ausentes.

Inventariar o conteúdo com limites de tamanho e quantidade e validar caminhos reais. Rejeitar componentes que escapem do diretório de origem por caminhos relativos, links ou arquivos especiais. Conteúdo desconhecido precisa aparecer no relatório; não deve ser descartado silenciosamente.

## Conversão e compatibilidade

Classificar cada componente como convertido, requer configuração ou bloqueado. Diferenciar compatibilidade estrutural, descoberta pelo Codex e comportamento testado.

Skills devem manter seus arquivos de apoio, gatilhos e intenção. Converter nomes de ferramentas e comandos somente quando houver equivalência conhecida. Comandos e agentes podem tornar-se skills quando essa adaptação preservar sua função; isolamento, permissões e delegação não podem ser declarados equivalentes sem validação.

Manifests, MCP e hooks exigem adaptadores próprios. MCP deve preservar transportes e configuração compatíveis e identificar runtimes ou credenciais necessários. Hooks só podem ser ativados quando eventos, entradas e efeitos forem compatíveis com os recursos do Codex detectados na máquina.

Campos exclusivos do Claude Code, incluindo configurações e recursos experimentais, precisam de tratamento explícito. Preservar o material de origem para inspeção e explicar o impacto de qualquer recurso não convertido. Um bloqueio essencial impede declarar o pacote pronto para instalação funcional; recursos independentes podem ser selecionados e convertidos separadamente.

Preservar autoria, avisos e licenças existentes. O usuário escolhe exportar ou instalar componentes de origem; a aplicação não publica cópias em um catálogo público automaticamente.

## Uso do Codex na conversão

Invocar o executável diretamente, com argumentos separados e entrada por stdin. Não construir comandos de shell a partir da URL ou do conteúdo recebido.

Fornecer apenas os arquivos necessários e a tarefa de adaptação, explicitando que o conteúdo do repositório é material a converter. A execução deve usar a área gerenciada e permissões restritas. O modelo não deve receber acesso de escrita ao destino de instalação nem às configurações reais do usuário.

Preferir respostas estruturadas com propostas de arquivos e relatório, validadas pela aplicação antes de serem gravadas. A saída do modelo não deve executar comandos de instalação ou definir caminhos arbitrários.

Separar progresso, resultado e erros. Tratar autenticação expirada, limites de uso, ausência de rede, saída inválida, timeout e cancelamento. Falhas deixam um diagnóstico e nenhuma instalação é iniciada automaticamente.

## Instalação e recuperação

Gerar o pacote no formato suportado pelo Codex detectado e registrar um marketplace local gerenciado pelo aplicativo quando esse for o mecanismo disponível. Preferir comandos oficiais de instalação. Não editar o cache de plugins do Codex diretamente.

Uma skill independente poderá ter um destino específico suportado, também detectado e documentado. Não escolher um diretório apenas porque outro usuário possui arquivos nele.

Antes de alterar uma instalação, registrar os arquivos e configurações pertencentes à operação e criar backup. Não substituir uma instalação com o mesmo identificador sem apresentar o conflito. Atualizações preservam recuperação da versão anterior.

Executar a instalação sem instalar dependências ou habilitar código executável da origem silenciosamente. A tela deve informar o que será ativado e o que ainda precisa de configuração.

Verificar que o Codex reconhece a instalação e que os arquivos esperados estão presentes. Quando uma nova conversa ou reinicialização do Codex for necessária, apresentar essa instrução. Reconhecimento da instalação não será descrito como prova de funcionamento de uma integração externa.

Remoção afeta apenas os componentes e registros que o aplicativo criou. Não remover configurações compartilhadas ou arquivos alterados pelo usuário sem detectar o conflito.

## Persistência local

Usar o diretório de dados do aplicativo para downloads, resultados, histórico e backups. Cada operação terá identificador próprio, revisão de origem, hashes dos arquivos, destino e estado de execução.

Gravar metadados de forma atômica e manter um diário das etapas de instalação para recuperar interrupções. Registrar erros sem credenciais ou conteúdo sensível desnecessário. A interface permitirá abrir o resultado, exportar o relatório e limpar os dados gerenciados.

## Verificação e critérios de entrega

- Testes de URLs, inventário e caminhos, incluindo arquivos malformados, links que escapam da origem e nomes conflitantes.
- Fixtures de skill independente, plugin com várias skills, marketplace, comandos, agentes, MCP e hooks.
- Testes de conversão que verifiquem recursos preservados e impedimentos reais, incluindo saídas inválidas do modelo.
- Testes de instalação, atualização, conflito, cancelamento, interrupção, remoção e recuperação em um ambiente Codex separado do ambiente do usuário.
- Verificação visual do fluxo completo na janela do aplicativo, incluindo falhas e acessibilidade básica.
- Build e instalador Windows verificáveis, com README que use somente comandos executados e comprovados.
- Testes automatizados no GitHub e exemplo real de conversão, registrando os limites do caso testado.

O projeto só estará pronto para uso público quando o fluxo URL → conversão → instalação → reconhecimento funcionar na distribuição produzida, com recuperação verificada. Suporte funcional de cada integração terá evidência própria; a existência de um pacote ou de uma janela não basta.

## Bases consultadas

Documentação consultada em 13 de outubro de 2026. As capacidades deverão ser verificadas também no ambiente de cada usuário.

- [Codex: execução não interativa, autenticação reutilizada e saída estruturada](https://learn.chatgpt.com/docs/non-interactive-mode).
- [Codex: formatos de plugin e marketplaces locais](https://developers.openai.com/plugins/build/plugins).
- [Claude Code: manifests e componentes de plugins](https://code.claude.com/docs/en/plugins-reference).
- [OpenAI: adaptação de plugins do Claude Code](https://developers.openai.com/plugins/guides/submit-claude-plugin). A orientação de publicação pública é distinta da instalação local deste projeto.

Verificação local inicial: Codex CLI 0.157.1 disponível; ajuda expõe codex exec e codex plugin add; codex login status informa autenticação por ChatGPT. Isso confirma recursos desta máquina, não uma versão mínima universal ou equivalência completa entre plataformas.
