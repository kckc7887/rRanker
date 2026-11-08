import type { Directory } from 'expo-file-system';
import type { GameId } from '@rranker/sdk/domain/game-bind-options';
import type { SqliteSnapshotRepository } from '@rranker/sdk/storage/sqlite-snapshot-repository';
import { measureDirectoryBytesAsync } from '@rranker/sdk/features/storage-management/fs-storage';

export type StorageMeasurementInventory = {
  scores: Awaited<ReturnType<SqliteSnapshotRepository['listAccountScoreSizes']>>;
  resources: Awaited<ReturnType<SqliteSnapshotRepository['listResourceSizes']>>;
};

export type StorageOwnership = {
  ownsAccount: (accountId: string) => boolean;
  resourceKeys?: readonly string[];
  resourcePrefixes?: readonly string[];
  accountResourcePrefixes?: readonly string[];
};

export type CacheResource = {
  root: () => Directory;
  clear: () => void | Promise<void>;
  currentVersions?: readonly string[];
};

export type GameStorageAdapter = {
  gameId: GameId;
  title: string;
  color: string;
  note: string;
  queryKeys: readonly (readonly unknown[])[];
  resetMemory?: () => void;
  fileResources: readonly CacheResource[];
  measure: (inventory: StorageMeasurementInventory) => Promise<number>;
  measureDurable: (inventory: StorageMeasurementInventory) => number;
  clear: (snapshots: SqliteSnapshotRepository, inventory: StorageMeasurementInventory) => Promise<void>;
};

export type GameStorageDefinition = Omit<GameStorageAdapter, 'measure' | 'measureDurable' | 'clear'> & {
  ownership: StorageOwnership;
  ownsDurableAccount?: (accountId: string) => boolean;
};

export function accountOwnership(gameId: GameId, exclude?: (accountId: string) => boolean) {
  return (accountId: string) => (accountId === gameId || accountId.startsWith(`${gameId}:`)) && !exclude?.(accountId);
}

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
    const prefix = ['account-thumbnail:', ...(ownership.accountResourcePrefixes ?? [])].find((value) => key.startsWith(value));
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
  definition: GameStorageDefinition,
): GameStorageAdapter {
  const { ownership, ownsDurableAccount, ...adapter } = definition;
  return {
    ...adapter,
    measureDurable: inventory => ownsDurableAccount
      ? selectStorageInventory(inventory, { ownsAccount: ownsDurableAccount }).bytes : 0,
    async measure(inventory) {
      const fileBytes = await Promise.all(adapter.fileResources.map((resource) => measureDirectoryBytesAsync(resource.root())));
      return selectStorageInventory(inventory, ownership).bytes + fileBytes.reduce((sum, bytes) => sum + bytes, 0);
    },
    async clear(snapshots, inventory) {
      const selected = selectStorageInventory(inventory, ownership);
      await snapshots.clearAccountScores(selected.accountIds);
      /** 头像等资源可能没有对应的成绩记录。 */
      await snapshots.clearResources(selected.resourceKeys);
      for (const resource of adapter.fileResources) await resource.clear();
    },
  };
}
