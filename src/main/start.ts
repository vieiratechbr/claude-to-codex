import { app, dialog } from 'electron';
import { bootApp } from './index';
import { isAbsolute } from 'node:path';
import { mkdirSync } from 'node:fs';
if (process.env.CLAUDE_TO_CODEX_HOME) {
  const directory = process.env.CLAUDE_TO_CODEX_HOME;
  if (!isAbsolute(directory)) throw new Error('CLAUDE_TO_CODEX_HOME precisa ser um caminho absoluto.');
  mkdirSync(directory, { recursive: true }); app.setPath('userData', directory);
}
if (!app.requestSingleInstanceLock()) app.quit();
else bootApp().catch(error => { dialog.showErrorBox('Não foi possível abrir o aplicativo',error.message); app.quit(); });
