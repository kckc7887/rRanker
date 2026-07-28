import Storage from 'expo-sqlite/kv-store';
import { CHUNITHM_TEST_ACCOUNT_ID } from '@/domain/bound-account';

export type ChunithmDemoAccountProfile = {
  id: string;
  displayName: string;
};

type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
};

type StoredChunithmDemoAccountV1 = {
  version: 1;
  account: ChunithmDemoAccountProfile;
};

const STORE_KEY = 'rranker.chunithm-demo-account.v1';
export const DEFAULT_CHUNITHM_DEMO_PLAYER_NAME = '示例账号';

export function isChunithmDemoAccountId(accountId: string): boolean {
  return accountId === CHUNITHM_TEST_ACCOUNT_ID;
}

export function parseChunithmDemoAccountProfile(
  value: unknown,
): ChunithmDemoAccountProfile | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as { version?: unknown; account?: unknown };
  if (raw.version !== 1 || !raw.account || typeof raw.account !== 'object') return null;
  const account = raw.account as { id?: unknown; displayName?: unknown };
  if (typeof account.id !== 'string' || !isChunithmDemoAccountId(account.id)) return null;
  const displayName = typeof account.displayName === 'string' ? account.displayName.trim() : '';
  return displayName ? { id: account.id, displayName } : null;
}

export class ChunithmDemoAccountStore {
  constructor(private readonly storage: KeyValueStore = Storage) {}

  async load(): Promise<ChunithmDemoAccountProfile | null> {
    try {
      const raw = await this.storage.getItem(STORE_KEY);
      return raw ? parseChunithmDemoAccountProfile(JSON.parse(raw)) : null;
    } catch {
      await this.storage.removeItem(STORE_KEY).catch(() => undefined);
      return null;
    }
  }

  async save(profile: ChunithmDemoAccountProfile): Promise<void> {
    const displayName = profile.displayName.trim();
    if (!isChunithmDemoAccountId(profile.id) || !displayName) {
      throw new Error('中二节奏示例账号名称不能为空');
    }
    const value: StoredChunithmDemoAccountV1 = {
      version: 1,
      account: { id: profile.id, displayName },
    };
    await this.storage.setItem(STORE_KEY, JSON.stringify(value));
  }

  async remove(): Promise<void> {
    await this.storage.removeItem(STORE_KEY);
  }
}

export const chunithmDemoAccountStore = new ChunithmDemoAccountStore();
