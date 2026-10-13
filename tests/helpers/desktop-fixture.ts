import { app, type BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { bootApp } from '../../src/main/index';
import { AppService } from '../../src/main/service';
const root = process.env.C2C_FIXTURE_ROOT!;
app.setPath('userData',root);
let window: BrowserWindow|undefined;
const service = new AppService({
  dataRoot: root, codexHome: join(root,'codex-home'),
  onProgress: event => window?.webContents.send('c2c:progress',event),
  readSource: async request => ({
    id: randomUUID(), request, commit: 'f'.repeat(40), warnings: [],
    files: [
      { path: 'SKILL.md', mode: '100644', oid: '', data: Buffer.from('---\nname: teste-ui\ndescription: Fixture artificial exclusiva dos testes\n---\nOlá. Conteúdo artificial. <script>window.sourceExecuted=true</script>') },
      { path: 'LICENSE', mode: '100644', oid: '', data: Buffer.from('Licença fictícia exclusiva dos testes.') }
    ]
  })
});
bootApp({ dataRoot: root, service }).then(value => { window = value; });
