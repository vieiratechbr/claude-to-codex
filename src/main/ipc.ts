import { ipcMain, dialog, shell, clipboard, type BrowserWindow } from 'electron';
import { z } from 'zod';
import { writeFile } from 'node:fs/promises';
import { zipSync } from 'fflate';
import { isTrustedSender } from './protocol';
import { AppService } from './service';
import { loadBundle } from '../core/installer';
import { redact } from '../core/process';
import { isTrustedUpdateUrl } from '../core/updates';
const id = z.string().regex(/^[a-zA-Z0-9-]{1,100}$/);
export function registerIpc(window: BrowserWindow, service: AppService): void {
  const add = (name: string, schema: z.ZodType, handler: (value: any) => Promise<unknown>|unknown) => {
    ipcMain.handle('c2c:' + name, async (event, input) => {
      if (event.sender !== window.webContents || !isTrustedSender(event.senderFrame, window.webContents.mainFrame)) return { ok: false, error: 'Origem não autorizada.' };
      try { return { ok: true, value: await handler(schema.parse(input)) }; }
      catch (error) { return { ok: false, error: error instanceof z.ZodError ? 'Confira os campos informados.' : redact((error as Error).message) }; }
    });
  };
  const noInput = z.undefined();
  add('diagnose',noInput,() => service.diagnose()); add('settings',noInput,() => service.settings());
  add('analyze',z.object({ url: z.string().max(1000), ref: z.string().max(200).optional(), subdirectory: z.string().max(220).optional() }).strict(),value => service.analyze(value));
  add('convert',z.object({ analysisId: id, componentIds: z.array(id).min(1).max(1000), useCodex: z.boolean() }).strict(),value => service.convert(value.analysisId,value.componentIds,value.useCodex));
  add('install',id,value => service.install(value));
  add('verifyInstallation',id,value => service.verifyInstallation(value));
  add('checkForUpdates',noInput,() => service.checkForUpdates());
  add('openAppUpdate',z.string().max(400),async url => { if (!isTrustedUpdateUrl(url)) throw new Error('Endereço de atualização não autorizado.'); await shell.openExternal(url); });
  add('copyText',z.string().max(4000),text => clipboard.writeText(text));
  add('prepareUpdate',z.object({ installationId: id, useCodex: z.boolean() }).strict(),value => service.prepareUpdate(value.installationId,value.useCodex));
  add('applyUpdate',z.object({ installationId: id, bundleId: id }).strict(),value => service.applyUpdate(value.installationId,value.bundleId));
  add('remove',id,value => service.remove(value)); add('restore',id,value => service.restore(value));
  add('listHistory',noInput,() => service.listHistory());
  add('reviewBundle',id,value => service.reviewBundle(value));
  add('preview',z.object({ bundleId: id, path: z.string().max(220) }).strict(),value => service.readPreview(value.bundleId,value.path));
  add('cancel',id,value => service.cancel(value));
  add('selectCodexExecutable',noInput,async () => {
    const selected = await dialog.showOpenDialog(window,{ title: 'Selecione o executável do Codex', properties: ['openFile'], filters: [{ name: 'Executável', extensions: ['exe'] }] });
    return selected.canceled ? service.diagnose() : service.selectCodex(selected.filePaths[0]);
  });
  add('openDataFolder',noInput,async () => { const settings = await service.settings(); await shell.openPath(settings.dataRoot); });
  add('cleanDownloads',noInput,async () => {
    const confirmation = await dialog.showMessageBox(window,{ type: 'question', title: 'Limpar downloads', message: 'Remover os repositórios baixados? Histórico, conversões, instalações e backups serão preservados.', buttons: ['Cancelar','Limpar downloads'], defaultId: 0, cancelId: 0 });
    if (confirmation.response === 1) await service.cleanDownloads();
  });
  add('exportBundle',id,async value => {
    const bundle = await loadBundle(service.store,value);
    const selected = await dialog.showSaveDialog(window,{ title: 'Exportar pacote convertido', defaultPath: bundle.pluginName + '.zip', filters: [{ name: 'Pacote ZIP', extensions: ['zip'] }] });
    if (!selected.filePath || selected.canceled) return {};
    const files = Object.fromEntries(bundle.files.map(f => [f.path,new Uint8Array(f.data)]));
    files['conversion-report.json'] = new TextEncoder().encode(JSON.stringify({ source: bundle.source, commit: bundle.sourceCommit, findings: bundle.findings, installable: bundle.installable },null,2));
    await writeFile(selected.filePath,zipSync(files,{ level: 6 }));
    return { path: selected.filePath };
  });
}
