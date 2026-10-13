import { app, dialog } from 'electron';
import { bootApp } from './index';
if (!app.requestSingleInstanceLock()) app.quit();
else bootApp().catch(error => { dialog.showErrorBox('Não foi possível abrir o aplicativo',error.message); app.quit(); });
