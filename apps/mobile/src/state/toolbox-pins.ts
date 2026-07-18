import { create } from 'zustand';
import type { GameId } from '@/domain/game-bind-options';
import { getGameToolbox } from '@/domain/game-toolbox';
import {
  emptyPinnedToolIdsByGame,
  pinnedToolPreferencesStore,
  type PinnedToolIdsByGame,
} from '@/features/toolbox/pinned-tool-preferences';

type ToolboxPinsState = {
  hydrated: boolean;
  pinnedToolIdsByGame: PinnedToolIdsByGame;
  hydrate: () => Promise<void>;
  togglePinnedTool: (gameId: GameId, toolId: string) => Promise<void>;
};

type PinnedToolPreferencesAccess = Pick<typeof pinnedToolPreferencesStore, 'load' | 'save'>;

export function createToolboxPinsStore(preferences: PinnedToolPreferencesAccess = pinnedToolPreferencesStore) {
  let hydrationPromise: Promise<void> | null = null;
  let mutationQueue: Promise<void> = Promise.resolve();
  return create<ToolboxPinsState>((set, get) => ({
    hydrated: false,
    pinnedToolIdsByGame: emptyPinnedToolIdsByGame(),
    hydrate: async () => {
      if (get().hydrated) return;
      hydrationPromise ??= preferences.load().then((pinnedToolIdsByGame) => {
        set({ hydrated: true, pinnedToolIdsByGame });
      }).finally(() => {
        hydrationPromise = null;
      });
      await hydrationPromise;
    },
    togglePinnedTool: (gameId, toolId) => {
      const operation = mutationQueue.then(async () => {
        await get().hydrate();
        if (!getGameToolbox(gameId).tools.some((tool) => tool.id === toolId)) return;
        const previous = get().pinnedToolIdsByGame;
        const currentIds = previous[gameId];
        const nextIds = currentIds.includes(toolId)
          ? currentIds.filter((id) => id !== toolId)
          : [...currentIds, toolId];
        const next = { ...previous, [gameId]: nextIds };
        set({ pinnedToolIdsByGame: next });
        try {
          await preferences.save(next);
        } catch (error) {
          set({ pinnedToolIdsByGame: previous });
          throw error;
        }
      });
      mutationQueue = operation.catch(() => undefined);
      return operation;
    },
  }));
}

export const useToolboxPins = createToolboxPinsStore();
