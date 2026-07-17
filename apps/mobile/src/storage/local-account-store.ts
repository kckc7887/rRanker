import Storage from 'expo-sqlite/kv-store';
import { isLocalMaimaiAccountId } from '@/domain/bound-account';

export type LocalAccountProfile = {
  id: string;
  displayName: string;
};

type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
};

type StoredLocalAccountsV1 = {
  version: 1;
  accounts: LocalAccountProfile[];
};

const STORE_KEY = 'rranker.local-maimai-accounts.v1';
export const DEFAULT_LOCAL_PLAYER_NAME = '本地玩家';
export const LOCAL_PLAYER_NAME_MAX_LENGTH = 20;

export function normalizeLocalPlayerName(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, LOCAL_PLAYER_NAME_MAX_LENGTH);
}

export function parseLocalAccountProfiles(value: unknown): LocalAccountProfile[] {
  if (!value || typeof value !== 'object') return [];
  const raw = value as { version?: unknown; accounts?: unknown };
  if (raw.version !== 1 || !Array.isArray(raw.accounts)) return [];
  const seen = new Set<string>();
  const profiles: LocalAccountProfile[] = [];
  for (const candidate of raw.accounts) {
    if (!candidate || typeof candidate !== 'object') continue;
    const account = candidate as { id?: unknown; displayName?: unknown };
    if (typeof account.id !== 'string' || !isLocalMaimaiAccountId(account.id) || seen.has(account.id)) continue;
    const displayName = typeof account.displayName === 'string'
      ? normalizeLocalPlayerName(account.displayName)
      : null;
    if (!displayName) continue;
    seen.add(account.id);
    profiles.push({ id: account.id, displayName });
  }
  return profiles;
}

export class LocalAccountStore {
  constructor(private readonly storage: KeyValueStore = Storage) {}

  async load(): Promise<LocalAccountProfile[]> {
    try {
      const raw = await this.storage.getItem(STORE_KEY);
      return raw ? parseLocalAccountProfiles(JSON.parse(raw)) : [];
    } catch {
      await this.storage.removeItem(STORE_KEY).catch(() => undefined);
      return [];
    }
  }

  async upsert(profile: LocalAccountProfile): Promise<void> {
    const displayName = normalizeLocalPlayerName(profile.displayName);
    if (!isLocalMaimaiAccountId(profile.id) || !displayName) {
      throw new Error('本地玩家名称不能为空');
    }
    const accounts = (await this.load()).filter((account) => account.id !== profile.id);
    const value: StoredLocalAccountsV1 = {
      version: 1,
      accounts: [...accounts, { id: profile.id, displayName }],
    };
    await this.storage.setItem(STORE_KEY, JSON.stringify(value));
  }

  async remove(accountId: string): Promise<void> {
    const accounts = (await this.load()).filter((account) => account.id !== accountId);
    if (accounts.length === 0) {
      await this.storage.removeItem(STORE_KEY);
      return;
    }
    const value: StoredLocalAccountsV1 = { version: 1, accounts };
    await this.storage.setItem(STORE_KEY, JSON.stringify(value));
  }
}

export const localAccountStore = new LocalAccountStore();
