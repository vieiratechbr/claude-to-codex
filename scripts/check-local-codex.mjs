import { spawn } from 'node:child_process';
const child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'tests/integration/codex-local.test.ts'], { stdio: 'inherit', shell: false, windowsHide: true, env: { ...process.env, C2C_NATIVE_TEST: '1' } });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
