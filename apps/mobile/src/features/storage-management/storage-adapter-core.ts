import type { Directory } from 'expo-file-system';
import type { GameId } from '@/domain/game-bind-options';
import { invalidateResourceWrites } from '@/services/snapshot-cache-utils';
import type { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { measureDirectoryBytesAsync } from './fs-storage';

export type StorageMeasurementInventory = {
  scores: Awaited<ReturnType<SqliteSnapshotRepository['listAccountScoreSizes']>>;
  resources: Awaited<ReturnType<SqliteSnapshotRepository['listResourceSizes']>>;
  catalogBytes: number;
  legacyScoreBytes: number;
};

export type StorageOwnership = {
  ownsAccount: (accountId: string) => boolean;
  resourceKeys?: readonly string[];
  resourcePrefixes?: readonly string[];
  includeCatalog?: boolean;
};

export type GameStorageAdapter = {
  gameId: GameId;
  title: string;
  color: string;
  note: string;
  queryKeys: readonly (readonly unknown[])[];
  resetMemory?: () => void;
  fileResources: readonly {
    persistence: 'temporary' | 'versioned-asset';
    root: () => Directory;
    clear: () => void;
  }[];
  measure: (snapshots: SqliteSnapshotRepository, inventory?: StorageMeasurementInventory) => Promise<number>;
  clear: (snapshots: SqliteSnapshotRepository) => Promise<void>;
};

const ACCOUNT_RESOURCE_PREFIXES = ['score:', 'chunithm-score:', 'account-avatar:', 'account-thumbnail:', 'phigros-save:'];

export async function collectStorageMeasurementInventory(
  snapshots: SqliteSnapshotRepository,
  includeCatalog = true,
): Promise<StorageMeasurementInventory> {
  const [scores, resources, catalogBytes, legacyScoreBytes] = await Promise.all([
    snapshots.listAccountScoreSizes(),
    snapshots.listResourceSizes(),
    includeCatalog ? snapshots.measureCatalogBytes() : Promise.resolve(0),
    includeCatalog ? snapshots.measureLegacyScoreBytes() : Promise.resolve(0),
  ]);
  return { scores, resources, catalogBytes, legacyScoreBytes };
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
    includeCatalog: ownership.includeCatalog === true,
    bytes: scores.reduce((sum, row) => sum + row.bytes, 0)
      + resources.reduce((sum, row) => sum + row.bytes, 0)
      + (ownership.includeCatalog ? inventory.catalogBytes + inventory.legacyScoreBytes : 0),
  };
}

export function createGameStorageAdapter(
  definition: Omit<GameStorageAdapter, 'measure' | 'clear'> & { ownership: StorageOwnership },
): GameStorageAdapter {
  const { ownership, ...adapter } = definition;
  return {
    ...adapter,
    async measure(snapshots, inventory) {
      const [measured, fileBytes] = await Promise.all([
        inventory ?? collectStorageMeasurementInventory(snapshots, ownership.includeCatalog === true),
        Promise.all(adapter.fileResources.map((resource) => measureDirectoryBytesAsync(resource.root()))),
      ]);
      return selectStorageInventory(measured, ownership).bytes + fileBytes.reduce((sum, bytes) => sum + bytes, 0);
    },
    async clear(snapshots) {
      invalidateResourceWrites(adapter.gameId);
      const inventory = await collectStorageMeasurementInventory(snapshots, false);
      const selected = selectStorageInventory(inventory, ownership);
      await snapshots.clearAccountScores(selected.accountIds);
      // Resources can exist without any account score row.
      await snapshots.clearResources(selected.resourceKeys);
      if (selected.includeCatalog) await snapshots.clearCatalog();
      for (const resource of adapter.fileResources) resource.clear();
    },
  };
}
