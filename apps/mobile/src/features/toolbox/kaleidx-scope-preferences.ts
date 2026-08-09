import Storage from 'expo-sqlite/kv-store';
import {
  KALEIDX_GATE_IDS,
  KALEIDX_GATES_BY_ID,
  type KaleidxGateId,
} from '@/domain/kaleidx-scope';

export type KaleidxRunMode = 'solo' | 'multi';

export type KaleidxGateProgress = {
  completedSongIds: string[];
  soloSongIds: string[];
  multiSongIds: string[];
  keyObtained: boolean;
  gateCleared: boolean;
};

export type KaleidxAccountProgress = Partial<Record<KaleidxGateId, KaleidxGateProgress>>;
export type KaleidxProgressByAccount = Record<string, KaleidxAccountProgress>;

type StoredKaleidxProgressV1 = {
  version: 1;
  byAccount: KaleidxProgressByAccount;
};

type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
};

const STORE_KEY = 'rranker.toolbox.kaleidx-scope.v1';

export function emptyKaleidxGateProgress(): KaleidxGateProgress {
  return {
    completedSongIds: [],
    soloSongIds: [],
    multiSongIds: [],
    keyObtained: false,
    gateCleared: false,
  };
}

function parseSongIds(value: unknown, validIds: Set<string>, limit?: number): string[] {
  if (!Array.isArray(value)) return [];
  const parsed = [...new Set(value)]
    .filter((item): item is string => typeof item === 'string' && validIds.has(item));
  return limit === undefined ? parsed : parsed.slice(0, limit);
}

export function parseKaleidxProgress(value: unknown): KaleidxProgressByAccount {
  if (!value || typeof value !== 'object') return {};
  const root = value as { version?: unknown; byAccount?: unknown };
  if (root.version !== 1 || !root.byAccount || typeof root.byAccount !== 'object') return {};
  const output: KaleidxProgressByAccount = {};
  for (const [accountId, rawAccount] of Object.entries(root.byAccount as Record<string, unknown>)) {
    if (!accountId || accountId.length > 256 || !rawAccount || typeof rawAccount !== 'object') continue;
    const account: KaleidxAccountProgress = {};
    for (const gateId of KALEIDX_GATE_IDS) {
      const rawGate = (rawAccount as Record<string, unknown>)[gateId];
      if (!rawGate || typeof rawGate !== 'object') continue;
      const gate = KALEIDX_GATES_BY_ID[gateId];
      const raw = rawGate as Record<string, unknown>;
      const validIds = new Set(gate.keySongs.map((song) => song.id));
      const completedLimit = gate.trackerKind === 'random-one' ? 1 : undefined;
      const parsed: KaleidxGateProgress = {
        completedSongIds: gate.trackerKind === 'run' ? [] : parseSongIds(raw.completedSongIds, validIds, completedLimit),
        soloSongIds: gate.trackerKind === 'run' ? parseSongIds(raw.soloSongIds, validIds, 3) : [],
        multiSongIds: gate.trackerKind === 'run' ? parseSongIds(raw.multiSongIds, validIds, 4) : [],
        keyObtained: raw.keyObtained === true,
        gateCleared: raw.gateCleared === true,
      };
      if (parsed.gateCleared) parsed.keyObtained = true;
      account[gateId] = parsed;
    }
    if (Object.keys(account).length > 0) output[accountId] = account;
  }
  return output;
}

export class KaleidxScopePreferencesStore {
  constructor(private readonly storage: KeyValueStore = Storage) {}

  async load(): Promise<KaleidxProgressByAccount> {
    try {
      const raw = await this.storage.getItem(STORE_KEY);
      return raw ? parseKaleidxProgress(JSON.parse(raw)) : {};
    } catch {
      await this.storage.removeItem(STORE_KEY).catch(() => undefined);
      return {};
    }
  }

  async save(byAccount: KaleidxProgressByAccount): Promise<void> {
    const parsed = parseKaleidxProgress({ version: 1, byAccount });
    const value: StoredKaleidxProgressV1 = { version: 1, byAccount: parsed };
    await this.storage.setItem(STORE_KEY, JSON.stringify(value));
  }
}

export const kaleidxScopePreferencesStore = new KaleidxScopePreferencesStore();
