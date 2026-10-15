; A UI-only fixture: no payload, registry entries, shortcuts or installation.
Unicode true
Name "Claude to Codex · Prévia sem instalar"
OutFile "${C2C_PREVIEW_ROOT}\installer-preview.exe"
RequestExecutionLevel user
!include LogicLib.nsh
!define isUpdated '0 == 1'
Var launchLink
!macro skipPageIfUpdated
!macroend
!macro C2CPreviewExec result target verb parameters
  FileOpen $R9 "${C2C_PREVIEW_ROOT}\events.log" a
  FileWrite $R9 "${target}|${parameters}$\r$\n"
  FileClose $R9
  StrCpy ${result} "ok"
!macroend
!define StdUtils.ExecShellAsUser '!insertmacro C2CPreviewExec'
!define MUI_ICON "${PROJECT_DIR}\build\installer\app-icon.ico"
!define MUI_WELCOMEFINISHPAGE_BITMAP "${PROJECT_DIR}\build\installer\sidebar.bmp"
!include "${PROJECT_DIR}\build\installer\custom.nsh"
!include MUI2.nsh
!insertmacro customHeader
!insertmacro customWelcomePage
!insertmacro customFinishPage
!insertmacro MUI_LANGUAGE "PortugueseBR"
Function .onInit
  StrCpy $launchLink "preview-app"
FunctionEnd
Section
SectionEnd
