import { expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OperationStore } from '../../src/core/store';
it('persiste registros e recusa IDs que escapem da área gerenciada', async () => {
  const root = await mkdtemp(join(tmpdir(), 'c2c-store-'));
  try {
    const store = new OperationStore(root);
    await store.save({ id: 'safe-id', kind: 'analysis', state: 'ready', createdAt: '2026-10-13', title: 'Fixture', data: { value: 3 } });
    expect((await new OperationStore(root).load('safe-id'))?.title).toBe('Fixture');
    expect(await store.list()).toHaveLength(1);
    await expect(store.load('../secret')).rejects.toThrow();
  } finally { await rm(root, { recursive: true, force: true }); }
});
