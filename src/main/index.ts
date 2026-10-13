import { app, BrowserWindow, protocol, net } from 'electron';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { AppService } from './service';
import { resolveAppResource } from './protocol';
import { registerIpc } from './ipc';
app.setName('Claude to Codex');
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
export async function bootApp(options: { dataRoot?: string; service?: AppService } = {}): Promise<BrowserWindow> {
  await app.whenReady();
  const rendererRoot = join(__dirname,'../renderer'); const dataRoot = options.dataRoot || app.getPath('userData'); await mkdir(dataRoot,{ recursive: true });
  const window = new BrowserWindow({ width: 1320, height: 900, minWidth: 900, minHeight: 680, show: false, backgroundColor: '#101514', title: 'Claude to Codex', autoHideMenuBar: true, webPreferences: { preload: join(__dirname,'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate',event => event.preventDefault());
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-navigate', event => event.preventDefault());
  });
  window.webContents.session.setPermissionRequestHandler((_contents,_permission,callback) => callback(false));
  protocol.handle('app',async request => {
    try { const path = resolveAppResource(request.url,rendererRoot); return await net.fetch(pathToFileURL(path).href); }
    catch { return new Response('Recurso não encontrado.',{ status: 404 }); }
  });
  const service = options.service || new AppService({ dataRoot, onProgress: event => { if (!window.isDestroyed()) window.webContents.send('c2c:progress',event); } });
  registerIpc(window,service); window.once('ready-to-show',() => window.show());
  await window.loadURL('app://local/index.html');
  app.on('window-all-closed',() => app.quit());
  return window;
}
