import { spawn } from 'node:child_process';
import electron from 'electron';
const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE;
const child = spawn(electron,['.'],{ stdio: 'inherit', env: environment, windowsHide: true });
child.on('exit',code => process.exit(code || 0));
child.on('error',error => { console.error(error.message); process.exit(1); });
