import { contextBridge, ipcRenderer } from 'electron';
import type { AppApi } from '../shared/api';
import type { ProgressEvent } from '../shared/contracts';
async function invoke<T>(name: string, payload?: unknown): Promise<T> {
  const response = await ipcRenderer.invoke('c2c:' + name, payload);
  if (!response.ok) throw new Error(response.error || 'Operação indisponível.');
  return response.value as T;
}
const api: AppApi = {
  diagnose: () => invoke('diagnose'), settings: () => invoke('settings'),
  analyze: value => invoke('analyze',value), convert: value => invoke('convert',value),
  install: id => invoke('install',id), prepareUpdate: value => invoke('prepareUpdate',value), applyUpdate: value => invoke('applyUpdate',value),
  remove: id => invoke('remove',id), restore: id => invoke('restore',id), listHistory: () => invoke('listHistory'),
  preview: value => invoke('preview',value), exportBundle: id => invoke('exportBundle',id),
  selectCodexExecutable: () => invoke('selectCodexExecutable'), openDataFolder: () => invoke('openDataFolder'),
  cleanDownloads: () => invoke('cleanDownloads'), cancel: id => invoke('cancel',id),
  onProgress: callback => { const handler = (_event: unknown, data: ProgressEvent) => callback(data); ipcRenderer.on('c2c:progress',handler); return () => ipcRenderer.removeListener('c2c:progress',handler); }
};
contextBridge.exposeInMainWorld('claudeToCodex', api);
