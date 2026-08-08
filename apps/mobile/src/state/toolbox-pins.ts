import { create } from 'zustand';
import type { GameId } from '@/domain/game-bind-options';
import type { ChunithmCollectionKind } from '@/domain/chunithm-collections';
import { getGameToolbox } from '@/domain/game-toolbox';
import {
  emptyHomePinPreferences,
  pinnedToolPreferencesStore,
  type HomePinPreferences,
  type PinnedChunithmCollection,
  type PinnedCollectionIdsByGame,
  type PinnedPlateIdsByGame,
  type PinnedToolIdsByGame,
} from '@/features/toolbox/pinned-tool-preferences';

type ToolboxPinsState = {
  hydrated: boolean;
  pinnedToolIdsByGame: PinnedToolIdsByGame;
  pinnedPlateIdsByGame: PinnedPlateIdsByGame;
  pinnedCollectionIdsByGame: PinnedCollectionIdsByGame;
  hydrate: () => Promise<void>;
  togglePinnedTool: (gameId: GameId, toolId: string) => Promise<void>;
  togglePinnedPlate: (gameId: GameId, plateId: number) => Promise<void>;
  togglePinnedCollection: (gameId: GameId, kind: ChunithmCollectionKind, id: number) => Promise<void>;
};

type PinnedToolPreferencesAccess = Pick<typeof pinnedToolPreferencesStore, 'load' | 'save'>;

export function createToolboxPinsStore(preferences: PinnedToolPreferencesAccess = pinnedToolPreferencesStore) {
  let hydrationPromise: Promise<void> | null = null;
  let mutationQueue: Promise<void> = Promise.resolve();
  return create<ToolboxPinsState>((set, get) => {
    const saveMutation = (
      update: (current: HomePinPreferences) => HomePinPreferences | null,
    ): Promise<void> => {
      const operation = mutationQueue.then(async () => {
        await get().hydrate();
        const state = get();
        const previous: HomePinPreferences = {
          pinnedToolIdsByGame: state.pinnedToolIdsByGame,
          pinnedPlateIdsByGame: state.pinnedPlateIdsByGame,
          pinnedCollectionIdsByGame: state.pinnedCollectionIdsByGame,
        };
        const next = update(previous);
        if (!next) return;
        set(next);
        try {
          await preferences.save(next);
        } catch (error) {
          set(previous);
          throw error;
        }
      });
      mutationQueue = operation.catch(() => undefined);
      return operation;
    };

    return {
      hydrated: false,
      ...emptyHomePinPreferences(),
      hydrate: async () => {
        if (get().hydrated) return;
        hydrationPromise ??= preferences.load().then((storedPreferences) => {
          set({ hydrated: true, ...storedPreferences });
        }).finally(() => {
          hydrationPromise = null;
        });
        await hydrationPromise;
      },
      togglePinnedTool: (gameId, toolId) => saveMutation((previous) => {
        if (!getGameToolbox(gameId).tools.some((tool) => tool.id === toolId)) return null;
        const currentIds = previous.pinnedToolIdsByGame[gameId];
        const nextIds = currentIds.includes(toolId)
          ? currentIds.filter((id) => id !== toolId)
          : [...currentIds, toolId];
        return {
          ...previous,
          pinnedToolIdsByGame: { ...previous.pinnedToolIdsByGame, [gameId]: nextIds },
        };
      }),
      togglePinnedPlate: (gameId, plateId) => saveMutation((previous) => {
        if (!Number.isSafeInteger(plateId) || plateId <= 0
          || !getGameToolbox(gameId).tools.some((tool) => tool.id === 'plates')) return null;
        const currentIds = previous.pinnedPlateIdsByGame[gameId];
        const nextIds = currentIds.includes(plateId)
          ? currentIds.filter((id) => id !== plateId)
          : [...currentIds, plateId];
        return {
          ...previous,
          pinnedPlateIdsByGame: { ...previous.pinnedPlateIdsByGame, [gameId]: nextIds },
        };
      }),
      togglePinnedCollection: (gameId, kind, id) => saveMutation((previous) => {
        if (!Number.isSafeInteger(id) || id < 0
          || !getGameToolbox(gameId).tools.some((tool) => tool.id === 'chunithm-collections')) return null;
        const current = previous.pinnedCollectionIdsByGame[gameId];
        const exists = current.some((item) => item.kind === kind && item.id === id);
        const next: PinnedChunithmCollection[] = exists
          ? current.filter((item) => !(item.kind === kind && item.id === id))
          : [...current, { kind, id }];
        return {
          ...previous,
          pinnedCollectionIdsByGame: { ...previous.pinnedCollectionIdsByGame, [gameId]: next },
        };
      }),
    };
  });
}

export const useToolboxPins = createToolboxPinsStore();
