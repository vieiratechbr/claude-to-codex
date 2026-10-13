import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['tests/**/*.test.{ts,mjs}'], maxWorkers: 2, fileParallelism: false, testTimeout: 15000 }
});
