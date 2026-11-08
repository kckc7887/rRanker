import { getGameDefinitions, getGameAdapter, getPlugins } from '@rranker/sdk/registry';
import { createGameStorageAdapter, type GameStorageAdapter } from '@rranker/sdk/features/storage-management/storage-adapter-core';
import { useAccountStore } from '@rranker/sdk/state/account-store';
export { collectStorageMeasurementInventory } from '@rranker/sdk/features/storage-management/storage-adapter-core';
export type { GameStorageAdapter, StorageMeasurementInventory } from '@rranker/sdk/features/storage-management/storage-adapter-core';
export { clearSharedCache, measureSharedCacheBytes, sharedCacheNote } from '@rranker/sdk/features/storage-management/shared-storage-cache';
export type StorageSegmentId = string;

export function getGameStorageAdapters(): GameStorageAdapter[] {
  return getGameDefinitions().map(game => {
    const accountIds = new Set(useAccountStore.getState().boundAccounts.filter(account => account.gameId === game.id).map(account => account.id));
    const definition = getGameAdapter(game.id)?.storage?.(game.id) ?? {
      gameId: game.id, title: game.title, color: '#94A3B8', note: '游戏数据缓存', queryKeys: [], fileResources: [],
      ownership: { ownsAccount: (accountId: string) => accountIds.has(accountId) },
    };
    const files = getPlugins().flatMap(plugin => plugin.kind === 'tool' && plugin.gameIds.includes(game.id)
      ? plugin.cache?.(game.id) ?? [] : []);
    return createGameStorageAdapter({ ...definition, fileResources: [...definition.fileResources, ...files] });
  });
}
export function getGameStorageAdapter(gameId: string): GameStorageAdapter | undefined {
  return getGameStorageAdapters().find(adapter => adapter.gameId === gameId);
}
