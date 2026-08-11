import Storage from 'expo-sqlite/kv-store';
import { MUSEDASH_TEST_ACCOUNT_ID } from '@/domain/bound-account';

export type MuseDashDemoAccountProfile = {
  id: string;
  displayName: string;
};

type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
};

type StoredMuseDashDemoAccountV1 = {
  version: 1;
  account: MuseDashDemoAccountProfile;
};

const STORE_KEY = 'rranker.musedash-demo-account.v1';
export const DEFAULT_MUSEDASH_DEMO_PLAYER_NAME = '示例账号';

export function isMuseDashDemoAccountId(accountId: string): boolean {
  return accountId === MUSEDASH_TEST_ACCOUNT_ID;
}

export function parseMuseDashDemoAccountProfile(
  value: unknown,
): MuseDashDemoAccountProfile | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as { version?: unknown; account?: unknown };
  if (raw.version !== 1 || !raw.account || typeof raw.account !== 'object') return null;
  const account = raw.account as { id?: unknown; displayName?: unknown };
  if (typeof account.id !== 'string' || !isMuseDashDemoAccountId(account.id)) return null;
  const displayName = typeof account.displayName === 'string' ? account.displayName.trim() : '';
  return displayName ? { id: account.id, displayName } : null;
}

export class MuseDashDemoAccountStore {
  constructor(private readonly storage: KeyValueStore = Storage) {}

  async load(): Promise<MuseDashDemoAccountProfile | null> {
    try {
      const raw = await this.storage.getItem(STORE_KEY);
      return raw ? parseMuseDashDemoAccountProfile(JSON.parse(raw)) : null;
    } catch {
      await this.storage.removeItem(STORE_KEY).catch(() => undefined);
      return null;
    }
  }

  async save(profile: MuseDashDemoAccountProfile): Promise<void> {
    const displayName = profile.displayName.trim();
    if (!isMuseDashDemoAccountId(profile.id) || !displayName) {
      throw new Error('喵斯快跑示例账号名称不能为空');
    }
    const value: StoredMuseDashDemoAccountV1 = {
      version: 1,
      account: { id: profile.id, displayName },
    };
    await this.storage.setItem(STORE_KEY, JSON.stringify(value));
  }

  async remove(): Promise<void> {
    await this.storage.removeItem(STORE_KEY);
  }
}

export const museDashDemoAccountStore = new MuseDashDemoAccountStore();
