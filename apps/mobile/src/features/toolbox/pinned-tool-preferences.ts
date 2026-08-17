import { createPreferencesStore } from '@/storage/create-preferences-store';
import type { GameId } from '@/domain/game-bind-options';
import type { ChunithmCollectionKind } from '@/domain/chunithm-collections';
import { getGameToolbox } from '@/domain/game-toolbox';

export type PinnedToolIdsByGame = Record<GameId, string[]>;
export type PinnedPlateIdsByGame = Record<GameId, number[]>;
export type PinnedChunithmCollection = {
  kind: ChunithmCollectionKind;
  id: number;
};
export type PinnedCollectionIdsByGame = Record<GameId, PinnedChunithmCollection[]>;

export type HomePinPreferences = {
  pinnedToolIdsByGame: PinnedToolIdsByGame;
  pinnedPlateIdsByGame: PinnedPlateIdsByGame;
  pinnedCollectionIdsByGame: PinnedCollectionIdsByGame;
};

type StoredPinnedToolsV1 = {
  version: 1;
  pinnedToolIdsByGame: PinnedToolIdsByGame;
  pinnedPlateIdsByGame?: PinnedPlateIdsByGame;
  pinnedCollectionIdsByGame?: PinnedCollectionIdsByGame;
};

const STORE_KEY = 'rranker.toolbox.pinned-tools.v1';
const GAME_IDS: readonly GameId[] = ['maimai', 'chunithm', 'phigros', 'phira', 'adofai', 'musedash', 'test', 'osu-standard', 'osu-mania', 'osu-catch', 'osu-taiko'];
const COLLECTION_KINDS: readonly ChunithmCollectionKind[] = ['trophy', 'character', 'plate', 'icon'];

export function emptyPinnedToolIdsByGame(): PinnedToolIdsByGame {
  return { maimai: [], chunithm: [], phigros: [], phira: [], adofai: [], musedash: [], test: [], 'osu-standard': [], 'osu-mania': [], 'osu-catch': [], 'osu-taiko': [] };
}

export function emptyPinnedPlateIdsByGame(): PinnedPlateIdsByGame {
  return { maimai: [], chunithm: [], phigros: [], phira: [], adofai: [], musedash: [], test: [], 'osu-standard': [], 'osu-mania': [], 'osu-catch': [], 'osu-taiko': [] };
}

export function emptyPinnedCollectionIdsByGame(): PinnedCollectionIdsByGame {
  return { maimai: [], chunithm: [], phigros: [], phira: [], adofai: [], musedash: [], test: [], 'osu-standard': [], 'osu-mania': [], 'osu-catch': [], 'osu-taiko': [] };
}

export function emptyHomePinPreferences(): HomePinPreferences {
  return {
    pinnedToolIdsByGame: emptyPinnedToolIdsByGame(),
    pinnedPlateIdsByGame: emptyPinnedPlateIdsByGame(),
    pinnedCollectionIdsByGame: emptyPinnedCollectionIdsByGame(),
  };
}

export function parseHomePinPreferences(value: unknown): HomePinPreferences {
  const output = emptyHomePinPreferences();
  if (!value || typeof value !== 'object') return output;
  const raw = value as { version?: unknown; pinnedToolIdsByGame?: unknown };
  if (raw.version !== 1 || !raw.pinnedToolIdsByGame || typeof raw.pinnedToolIdsByGame !== 'object') {
    return output;
  }
  const stored = raw.pinnedToolIdsByGame as Record<string, unknown>;
  for (const gameId of GAME_IDS) {
    if (!Array.isArray(stored[gameId])) continue;
    const validIds = new Set(getGameToolbox(gameId).tools.map((tool) => tool.id));
    output.pinnedToolIdsByGame[gameId] = [...new Set(stored[gameId])]
      .filter((toolId): toolId is string => typeof toolId === 'string' && validIds.has(toolId));
  }

  const storedPlateIds = (value as { pinnedPlateIdsByGame?: unknown }).pinnedPlateIdsByGame;
  if (storedPlateIds && typeof storedPlateIds === 'object') {
    for (const gameId of GAME_IDS) {
      const ids = (storedPlateIds as Record<string, unknown>)[gameId];
      if (!Array.isArray(ids) || !getGameToolbox(gameId).tools.some((tool) => tool.id === 'plates')) continue;
      output.pinnedPlateIdsByGame[gameId] = [...new Set(ids)]
        .filter((plateId): plateId is number => Number.isSafeInteger(plateId) && plateId > 0);
    }
  }

  const storedCollectionIds = (value as { pinnedCollectionIdsByGame?: unknown }).pinnedCollectionIdsByGame;
  if (storedCollectionIds && typeof storedCollectionIds === 'object') {
    for (const gameId of GAME_IDS) {
      const entries = (storedCollectionIds as Record<string, unknown>)[gameId];
      if (!Array.isArray(entries)
        || !getGameToolbox(gameId).tools.some((tool) => tool.id === 'chunithm-collections')) continue;
      const seen = new Set<string>();
      output.pinnedCollectionIdsByGame[gameId] = entries.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const candidate = entry as { kind?: unknown; id?: unknown };
        if (!COLLECTION_KINDS.includes(candidate.kind as ChunithmCollectionKind)) return [];
        if (!Number.isSafeInteger(candidate.id) || (candidate.id as number) < 0) return [];
        const key = `${candidate.kind}:${candidate.id}`;
        if (seen.has(key)) return [];
        seen.add(key);
        return [{ kind: candidate.kind as ChunithmCollectionKind, id: candidate.id as number }];
      });
    }
  }
  return output;
}

export function parsePinnedToolPreferences(value: unknown): PinnedToolIdsByGame {
  return parseHomePinPreferences(value).pinnedToolIdsByGame;
}

const { Store: PinnedToolPreferencesStore } = createPreferencesStore<HomePinPreferences>({
  storeKey: STORE_KEY,
  defaults: emptyHomePinPreferences,
  parse: parseHomePinPreferences,
  toStored: (preferences) => ({
    version: 1,
    ...parseHomePinPreferences({ version: 1, ...preferences }),
  }) satisfies StoredPinnedToolsV1,
});

export { PinnedToolPreferencesStore };

export const pinnedToolPreferencesStore = new PinnedToolPreferencesStore();
