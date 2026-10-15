# Identificação visual

A interface usa representações vetoriais do mascote Clawd, em laranja, e do símbolo do Codex (flor azul com terminal) para identificar a origem e o destino da conversão. São desenhadas localmente, sem carregar imagens ou fontes de servidores externos.

Referências visuais:

- [Mascote do Claude Code no repositório da Anthropic](https://github.com/anthropics/claude-code/issues/13755).
- [Ícone do aplicativo Codex no repositório da OpenAI](https://github.com/openai/codex/issues/31068) e [comparação visual anexada](https://gist.github.com/jjoanna2-debug/7a0eb035e408311b4129c7837a389aa7).

Esses elementos identificam produtos de terceiros. As marcas pertencem aos respectivos titulares; a licença MIT do código deste aplicativo não concede direitos sobre essas marcas. O Claude to Codex é um projeto independente, sem afiliação oficial com Anthropic ou OpenAI. Sua identidade própria permanece na barra lateral.

## Instalador Windows

A beta 0.3.0-beta.1 usa o símbolo próprio de cubo/seta no executável e no instalador. A lateral identifica Claude Code e Codex usando os mesmos vetores da interface, com verde escuro e laranja; as páginas nativas têm fundo claro e fonte Segoe UI para leitura e navegação pelo teclado.

Fontes vetoriais e exports ficam em `build/installer`. `scripts/generate-installer-assets.cjs` exporta BMPs de 24 bits e ICO com seis tamanhos por meio do Chromium/Electron instalado no projeto. Para regenerar no Windows, execute o script com Electron e `ELECTRON_RUN_AS_NODE` desativado. Os recursos gerados são versionados e usados pela CI, sem baixar imagens ou fontes durante a instalação.

O link de apoio é `https://github.com/vieiratechbr/claude-to-codex`, aprovado pelo mantenedor. A opção **Apoiar github** é opt-in e abre somente essa página; o instalador não adiciona estrelas, não faz login e não envia dados do usuário ao GitHub.
