import Storage from 'expo-sqlite/kv-store';
import type { GameId } from '@/domain/game-bind-options';
import { getGameToolbox } from '@/domain/game-toolbox';

export type PinnedToolIdsByGame = Record<GameId, string[]>;

type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
};

type StoredPinnedToolsV1 = {
  version: 1;
  pinnedToolIdsByGame: PinnedToolIdsByGame;
};

const STORE_KEY = 'rranker.toolbox.pinned-tools.v1';
const GAME_IDS: readonly GameId[] = ['maimai', 'phigros', 'test'];

export function emptyPinnedToolIdsByGame(): PinnedToolIdsByGame {
  return { maimai: [], phigros: [], test: [] };
}

export function parsePinnedToolPreferences(value: unknown): PinnedToolIdsByGame {
  const output = emptyPinnedToolIdsByGame();
  if (!value || typeof value !== 'object') return output;
  const raw = value as { version?: unknown; pinnedToolIdsByGame?: unknown };
  if (raw.version !== 1 || !raw.pinnedToolIdsByGame || typeof raw.pinnedToolIdsByGame !== 'object') {
    return output;
  }
  const stored = raw.pinnedToolIdsByGame as Record<string, unknown>;
  for (const gameId of GAME_IDS) {
    if (!Array.isArray(stored[gameId])) continue;
    const validIds = new Set(getGameToolbox(gameId).tools.map((tool) => tool.id));
    output[gameId] = [...new Set(stored[gameId])]
      .filter((toolId): toolId is string => typeof toolId === 'string' && validIds.has(toolId));
  }
  return output;
}

export class PinnedToolPreferencesStore {
  constructor(private readonly storage: KeyValueStore = Storage) {}

  async load(): Promise<PinnedToolIdsByGame> {
    try {
      const raw = await this.storage.getItem(STORE_KEY);
      return raw ? parsePinnedToolPreferences(JSON.parse(raw)) : emptyPinnedToolIdsByGame();
    } catch {
      await this.storage.removeItem(STORE_KEY).catch(() => undefined);
      return emptyPinnedToolIdsByGame();
    }
  }

  async save(pinnedToolIdsByGame: PinnedToolIdsByGame): Promise<void> {
    const value: StoredPinnedToolsV1 = {
      version: 1,
      pinnedToolIdsByGame: parsePinnedToolPreferences({ version: 1, pinnedToolIdsByGame }),
    };
    await this.storage.setItem(STORE_KEY, JSON.stringify(value));
  }
}

export const pinnedToolPreferencesStore = new PinnedToolPreferencesStore();
