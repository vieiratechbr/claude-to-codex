import { app,clipboard, type BrowserWindow } from 'electron';
import {writeFileSync} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { bootApp } from '../../src/main/index';
import { AppService } from '../../src/main/service';
const root = process.env.C2C_FIXTURE_ROOT!;
app.setPath('userData',root);
clipboard.writeText=async text=>{writeFileSync(join(root,'copied-call.txt'),text);};
let window: BrowserWindow|undefined;
const service = new AppService({
  dataRoot: root, codexHome: join(root,'codex-home'),
  updates: async () => ({status:process.env.C2C_FIXTURE_NESTED === '1' ? 'available' : 'current',installedVersion:'0.3.0-beta.2',latestVersion:'0.9.0-beta.1',checkedAt:new Date().toISOString(),message:'Atualização artificial exclusiva do teste.',downloadUrl:'https://github.com/vieiratechbr/claude-to-codex/releases/download/v0.9.0-beta.1/Claude-to-Codex-0.9.0-beta.1-Windows-x64-Setup.exe'}),
  onProgress: event => window?.webContents.send('c2c:progress',event),
  readSource: async request => ({
    id: randomUUID(), request, commit: 'f'.repeat(40), warnings: [],
    files: process.env.C2C_FIXTURE_NESTED === '1' ? [
      {path:'.claude-plugin/plugin.json',mode:'100644',oid:'',data:Buffer.from('{"name":"fixture-collection","hooks":{"Stop":[]}}')},
      {path:'skills/teste-ui/SKILL.md',mode:'100644',oid:'',data:Buffer.from('---\nname: teste-ui\ndescription: Fixture artificial exclusiva dos testes\n---\nOlá. Conteúdo artificial.')},
      {path:'skills/other/SKILL.md',mode:'100644',oid:'',data:Buffer.from('---\nname: other\ndescription: Outra skill\n---\nOther portable instructions.')}
    ] : [
      { path: 'SKILL.md', mode: '100644', oid: '', data: Buffer.from('---\nname: teste-ui\ndescription: Fixture artificial exclusiva dos testes\n---\nOlá. Conteúdo artificial. <script>window.sourceExecuted=true</script>') },
      { path: 'LICENSE', mode: '100644', oid: '', data: Buffer.from('Licença fictícia exclusiva dos testes.') }
    ]
  })
});
bootApp({ dataRoot: root, service }).then(value => { window = value; });
