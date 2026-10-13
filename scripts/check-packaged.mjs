import { spawn } from 'node:child_process';
const child = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', 'tests/desktop/packaged.spec.ts'], { stdio: 'inherit', shell: false, windowsHide: true, env: { ...process.env, C2C_PACKAGED_TEST: '1' } });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
