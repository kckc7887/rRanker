import Storage from 'expo-sqlite/kv-store';
import type { GameId } from '@/domain/game-bind-options';
import { getGameToolbox } from '@/domain/game-toolbox';

export type PinnedToolIdsByGame = Record<GameId, string[]>;
export type PinnedPlateIdsByGame = Record<GameId, number[]>;

export type HomePinPreferences = {
  pinnedToolIdsByGame: PinnedToolIdsByGame;
  pinnedPlateIdsByGame: PinnedPlateIdsByGame;
};

type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
};

type StoredPinnedToolsV1 = {
  version: 1;
  pinnedToolIdsByGame: PinnedToolIdsByGame;
  pinnedPlateIdsByGame?: PinnedPlateIdsByGame;
};

const STORE_KEY = 'rranker.toolbox.pinned-tools.v1';
const GAME_IDS: readonly GameId[] = ['maimai', 'phigros', 'test'];

export function emptyPinnedToolIdsByGame(): PinnedToolIdsByGame {
  return { maimai: [], phigros: [], test: [] };
}

export function emptyPinnedPlateIdsByGame(): PinnedPlateIdsByGame {
  return { maimai: [], phigros: [], test: [] };
}

export function emptyHomePinPreferences(): HomePinPreferences {
  return {
    pinnedToolIdsByGame: emptyPinnedToolIdsByGame(),
    pinnedPlateIdsByGame: emptyPinnedPlateIdsByGame(),
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
  return output;
}

export function parsePinnedToolPreferences(value: unknown): PinnedToolIdsByGame {
  return parseHomePinPreferences(value).pinnedToolIdsByGame;
}

export class PinnedToolPreferencesStore {
  constructor(private readonly storage: KeyValueStore = Storage) {}

  async load(): Promise<HomePinPreferences> {
    try {
      const raw = await this.storage.getItem(STORE_KEY);
      return raw ? parseHomePinPreferences(JSON.parse(raw)) : emptyHomePinPreferences();
    } catch {
      await this.storage.removeItem(STORE_KEY).catch(() => undefined);
      return emptyHomePinPreferences();
    }
  }

  async save(preferences: HomePinPreferences): Promise<void> {
    const parsed = parseHomePinPreferences({ version: 1, ...preferences });
    const value: StoredPinnedToolsV1 = {
      version: 1,
      ...parsed,
    };
    await this.storage.setItem(STORE_KEY, JSON.stringify(value));
  }
}

export const pinnedToolPreferencesStore = new PinnedToolPreferencesStore();
