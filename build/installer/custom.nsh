; Keep the native NSIS install, update and recovery lifecycle.
!define MUI_BGCOLOR "F7F7F2"
!define MUI_TEXTCOLOR "18221D"

!macro customHeader
  SetFont "Segoe UI" 9
  BrandingText "vieiratechbr · GitHub"
!macroend

!macro customWelcomePage
  !insertmacro skipPageIfUpdated
  !define MUI_WELCOMEPAGE_TITLE "Bem-vindo ao Claude to Codex"
  !define MUI_WELCOMEPAGE_TEXT "Suas skills do Claude Code, no Codex da sua máquina.$\r$\n$\r$\nEste assistente vai instalar o aplicativo para você.$\r$\n$\r$\nClique em Próximo para começar."
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customFinishPage
  Function C2CStartApp
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 ""
    ${endif}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd

  Function C2COpenGitHub
    ${StdUtils.ExecShellAsUser} $0 "https://github.com/vieiratechbr/claude-to-codex" "open" ""
  FunctionEnd

  !define MUI_FINISHPAGE_TITLE "Está tudo pronto."
  !define MUI_FINISHPAGE_TEXT "O Claude to Codex foi instalado.$\r$\n$\r$\nQuer apoiar o projeto? Marque Apoiar github para abrir o repositório no navegador e deixar uma estrela."
  !ifndef HIDE_RUN_AFTER_FINISH
    !define MUI_FINISHPAGE_RUN
    !define MUI_FINISHPAGE_RUN_TEXT "Iniciar o aplicativo"
    !define MUI_FINISHPAGE_RUN_FUNCTION "C2CStartApp"
  !endif
  !define MUI_FINISHPAGE_SHOWREADME ""
  !define MUI_FINISHPAGE_SHOWREADME_TEXT "Apoiar github"
  !define MUI_FINISHPAGE_SHOWREADME_NOTCHECKED
  !define MUI_FINISHPAGE_SHOWREADME_FUNCTION "C2COpenGitHub"
  !define MUI_FINISHPAGE_LINK "github.com/vieiratechbr/claude-to-codex"
  !define MUI_FINISHPAGE_LINK_LOCATION "https://github.com/vieiratechbr/claude-to-codex"
  !define MUI_FINISHPAGE_LINK_COLOR "456139"
  !insertmacro MUI_PAGE_FINISH
!macroend
