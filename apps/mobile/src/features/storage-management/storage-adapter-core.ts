import type { Directory } from 'expo-file-system';
import type { GameId } from '@/domain/game-bind-options';
import { invalidateResourceWrites } from '@/services/snapshot-cache-utils';
import type { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { measureDirectoryBytesAsync } from './fs-storage';

export type StorageMeasurementInventory = {
  scores: Awaited<ReturnType<SqliteSnapshotRepository['listAccountScoreSizes']>>;
  resources: Awaited<ReturnType<SqliteSnapshotRepository['listResourceSizes']>>;
};

export type StorageOwnership = {
  ownsAccount: (accountId: string) => boolean;
  resourceKeys?: readonly string[];
  resourcePrefixes?: readonly string[];
};

export type GameStorageAdapter = {
  gameId: GameId;
  title: string;
  color: string;
  note: string;
  queryKeys: readonly (readonly unknown[])[];
  resetMemory?: () => void;
  fileResources: readonly {
    root: () => Directory;
    clear: () => void | Promise<void>;
  }[];
  measure: (inventory: StorageMeasurementInventory) => Promise<number>;
  clear: (snapshots: SqliteSnapshotRepository) => Promise<void>;
};

const ACCOUNT_RESOURCE_PREFIXES = ['chunithm-score:', 'account-avatar:', 'account-thumbnail:', 'phigros-save:'];

export async function collectStorageMeasurementInventory(
  snapshots: SqliteSnapshotRepository,
): Promise<StorageMeasurementInventory> {
  const [scores, resources] = await Promise.all([
    snapshots.listAccountScoreSizes(),
    snapshots.listResourceSizes(),
  ]);
  return { scores, resources };
}

export function selectStorageInventory(inventory: StorageMeasurementInventory, ownership: StorageOwnership) {
  const scores = inventory.scores.filter((row) => ownership.ownsAccount(row.accountId));
  const resources = inventory.resources.filter(({ key }) => {
    if (ownership.resourceKeys?.includes(key) || ownership.resourcePrefixes?.some((prefix) => key.startsWith(prefix))) return true;
    const prefix = ACCOUNT_RESOURCE_PREFIXES.find((value) => key.startsWith(value));
    return prefix !== undefined && ownership.ownsAccount(key.slice(prefix.length));
  });
  return {
    accountIds: scores.map((row) => row.accountId),
    resourceKeys: resources.map((row) => row.key),
    bytes: scores.reduce((sum, row) => sum + row.bytes, 0)
      + resources.reduce((sum, row) => sum + row.bytes, 0),
  };
}

export function createGameStorageAdapter(
  definition: Omit<GameStorageAdapter, 'measure' | 'clear'> & { ownership: StorageOwnership },
): GameStorageAdapter {
  const { ownership, ...adapter } = definition;
  return {
    ...adapter,
    async measure(inventory) {
      const fileBytes = await Promise.all(adapter.fileResources.map((resource) => measureDirectoryBytesAsync(resource.root())));
      return selectStorageInventory(inventory, ownership).bytes + fileBytes.reduce((sum, bytes) => sum + bytes, 0);
    },
    async clear(snapshots) {
      invalidateResourceWrites(adapter.gameId);
      const inventory = await collectStorageMeasurementInventory(snapshots);
      const selected = selectStorageInventory(inventory, ownership);
      await snapshots.clearAccountScores(selected.accountIds);
      /** 头像等资源可能没有对应的成绩记录。 */
      await snapshots.clearResources(selected.resourceKeys);
      for (const resource of adapter.fileResources) await resource.clear();
    },
  };
}
