import Storage from 'expo-sqlite/kv-store';
import { PHIGROS_TEST_ACCOUNT_ID } from '@/domain/bound-account';

export type PhigrosDemoAccountProfile = {
  id: string;
  displayName: string;
};

type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
};

type StoredPhigrosDemoAccountV1 = {
  version: 1;
  account: PhigrosDemoAccountProfile;
};

const STORE_KEY = 'rranker.phigros-demo-account.v1';
export const DEFAULT_PHIGROS_DEMO_PLAYER_NAME = '示例账号';

export function parsePhigrosDemoAccountProfile(value: unknown): PhigrosDemoAccountProfile | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as { version?: unknown; account?: unknown };
  if (raw.version !== 1 || !raw.account || typeof raw.account !== 'object') return null;
  const account = raw.account as { id?: unknown; displayName?: unknown };
  if (account.id !== PHIGROS_TEST_ACCOUNT_ID) return null;
  const displayName = typeof account.displayName === 'string' ? account.displayName.trim() : '';
  return displayName ? { id: PHIGROS_TEST_ACCOUNT_ID, displayName } : null;
}

export class PhigrosDemoAccountStore {
  constructor(private readonly storage: KeyValueStore = Storage) {}

  async load(): Promise<PhigrosDemoAccountProfile | null> {
    try {
      const raw = await this.storage.getItem(STORE_KEY);
      return raw ? parsePhigrosDemoAccountProfile(JSON.parse(raw)) : null;
    } catch {
      await this.storage.removeItem(STORE_KEY).catch(() => undefined);
      return null;
    }
  }

  async save(profile: PhigrosDemoAccountProfile): Promise<void> {
    const displayName = profile.displayName.trim();
    if (profile.id !== PHIGROS_TEST_ACCOUNT_ID || !displayName) {
      throw new Error('Phigros 示例账号名称不能为空');
    }
    const value: StoredPhigrosDemoAccountV1 = {
      version: 1,
      account: { id: PHIGROS_TEST_ACCOUNT_ID, displayName },
    };
    await this.storage.setItem(STORE_KEY, JSON.stringify(value));
  }

  async remove(): Promise<void> {
    await this.storage.removeItem(STORE_KEY);
  }
}
