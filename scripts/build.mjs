import { build } from 'esbuild';
import { build as buildVite } from 'vite';
import { mkdir } from 'node:fs/promises';
await mkdir('dist/main',{ recursive: true });
await build({ entryPoints: ['src/main/start.ts'], outfile: 'dist/main/index.cjs', bundle: true, platform: 'node', format: 'cjs', target: 'node24', external: ['electron'], sourcemap: true });
await build({ entryPoints: ['src/main/preload.ts'], outfile: 'dist/main/preload.cjs', bundle: true, platform: 'node', format: 'cjs', target: 'node24', external: ['electron'] });
await buildVite({ configFile: false, build: { outDir: 'dist/renderer', emptyOutDir: true }, base: '/' });
