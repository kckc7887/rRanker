import { describe, expect, it, vi } from 'vitest';
import type { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import {
  collectStorageMeasurementInventory,
  createGameStorageAdapter,
  selectStorageInventory,
  type StorageMeasurementInventory,
} from '@/features/storage-management/storage-adapter-core';
import { captureResourceWrites } from '@/services/snapshot-cache-utils';

vi.mock('@/features/storage-management/fs-storage', () => ({ measureDirectoryBytesAsync: async () => 0 }));

const inventory: StorageMeasurementInventory = {
  scores: [{ accountId: 'test:remote', bytes: 11 }, { accountId: 'test:local', bytes: 23 }, { accountId: 'another:remote', bytes: 31 }],
  resources: [
    { key: 'score:test:remote', bytes: 13 },
    { key: 'account-thumbnail:test:no-score-row', bytes: 17 },
    { key: 'account-avatar:test:local', bytes: 19 },
    { key: 'account-thumbnail:another:remote', bytes: 29 },
    { key: 'catalog', bytes: 7 },
    { key: 'detail:one', bytes: 5 },
    { key: 'unowned', bytes: 37 },
  ],
  catalogBytes: 41,
  legacyScoreBytes: 43,
};

function repository() {
  return {
    listAccountScoreSizes: vi.fn(async () => inventory.scores),
    listResourceSizes: vi.fn(async () => inventory.resources),
    measureCatalogBytes: vi.fn(async () => inventory.catalogBytes),
    measureLegacyScoreBytes: vi.fn(async () => inventory.legacyScoreBytes),
    clearAccountScores: vi.fn(async (_ids: readonly string[]) => undefined),
    clearResources: vi.fn(async (_keys: readonly string[]) => undefined),
    clearCatalog: vi.fn(async () => undefined),
  };
}

describe('storage adapter execution', () => {
  const ownership = {
    ownsAccount: (id: string) => id.startsWith('test:') && id !== 'test:local',
    resourceKeys: ['catalog'], resourcePrefixes: ['detail:'], includeCatalog: true,
  };
  const adapter = createGameStorageAdapter({
    gameId: 'test', title: 'Test', color: '#000', note: '', queryKeys: [], fileResources: [], ownership,
  });

  it('measures and clears the same owned inventory, including resources without score rows', async () => {
    const repo = repository();
    const snapshots = repo as unknown as SqliteSnapshotRepository;
    expect(selectStorageInventory(inventory, ownership)).toEqual({
      accountIds: ['test:remote'],
      resourceKeys: ['score:test:remote', 'account-thumbnail:test:no-score-row', 'catalog', 'detail:one'],
      includeCatalog: true,
      bytes: 137,
    });
    await expect(adapter.measure(snapshots, inventory)).resolves.toBe(137);
    expect(repo.listResourceSizes).not.toHaveBeenCalled();
    const assertOldWriteCurrent = captureResourceWrites('test');
    repo.listAccountScoreSizes.mockImplementationOnce(async () => {
      expect(assertOldWriteCurrent).toThrow('缓存请求已失效');
      return inventory.scores;
    });
    await adapter.clear(snapshots);
    expect(repo.clearAccountScores).toHaveBeenCalledWith(['test:remote']);
    expect(repo.clearResources).toHaveBeenCalledWith(['score:test:remote', 'account-thumbnail:test:no-score-row', 'catalog', 'detail:one']);
    expect(repo.clearCatalog).toHaveBeenCalledOnce();
    expect(repo.measureCatalogBytes).not.toHaveBeenCalled();
  });

  it('shares inventory reads for multiple measurements and leaves catalog out when not owned', async () => {
    const repo = repository();
    const snapshots = repo as unknown as SqliteSnapshotRepository;
    const measured = await collectStorageMeasurementInventory(snapshots);
    await Promise.all([adapter.measure(snapshots, measured), adapter.measure(snapshots, measured)]);
    expect(repo.listResourceSizes).toHaveBeenCalledOnce();
    expect(repo.listAccountScoreSizes).toHaveBeenCalledOnce();
    const accountOnly = createGameStorageAdapter({
      gameId: 'test', title: 'Test', color: '#000', note: '', queryKeys: [], fileResources: [],
      ownership: { ownsAccount: ownership.ownsAccount },
    });
    await expect(accountOnly.measure(snapshots)).resolves.toBe(41);
    await accountOnly.clear(snapshots);
    expect(repo.measureCatalogBytes).toHaveBeenCalledOnce();
    expect(repo.clearCatalog).not.toHaveBeenCalled();
  });

  it('does not clear files after a database failure and permits the next clear to succeed', async () => {
    const clearFiles = vi.fn();
    const failingAdapter = createGameStorageAdapter({
      gameId: 'test', title: 'Test', color: '#000', note: '', queryKeys: [], ownership,
      fileResources: [{ persistence: 'temporary', root: () => null as never, clear: clearFiles }],
    });
    const repo = repository();
    repo.clearResources.mockRejectedValueOnce(new Error('write failed'));
    await expect(failingAdapter.clear(repo as unknown as SqliteSnapshotRepository)).rejects.toThrow('write failed');
    expect(clearFiles).not.toHaveBeenCalled();
    await failingAdapter.clear(repo as unknown as SqliteSnapshotRepository);
    expect(clearFiles).toHaveBeenCalledOnce();
  });
});
