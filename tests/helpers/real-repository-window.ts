// Opt-in QA bootstrap: production acquisition/conversion and an isolated install home.
import { app, type BrowserWindow } from 'electron';
import { join } from 'node:path';
import { bootApp } from '../../src/main/index';
import { AppService } from '../../src/main/service';
const root = process.env.C2C_REAL_TEST_ROOT!;
if (!root) throw new Error('Temporary test root required.');
app.setPath('userData', root);
let window: BrowserWindow | undefined;
const service = new AppService({ dataRoot: root, codexHome: join(root, 'codex-home'), onProgress: event => window?.webContents.send('c2c:progress', event) });
bootApp({ dataRoot: root, service }).then(value => { window = value; window.webContents.setBackgroundThrottling(false); if (process.env.C2C_QA_SHOW_WINDOW !== '1') window.hide(); });
