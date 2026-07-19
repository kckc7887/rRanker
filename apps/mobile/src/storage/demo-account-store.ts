import Storage from 'expo-sqlite/kv-store';
import { MAIMAI_TEST_ACCOUNT_ID } from '@/domain/bound-account';

export type DemoAccountProfile = {
  id: string;
  displayName: string;
};

type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
};

type StoredDemoAccountsV1 = {
  version: 1;
  accounts: DemoAccountProfile[];
};

const STORE_KEY = 'rranker.maimai-demo-accounts.v1';
export const DEFAULT_DEMO_PLAYER_NAME = '示例账号';

export function isMaimaiDemoAccountId(accountId: string): boolean {
  return accountId === MAIMAI_TEST_ACCOUNT_ID
    || accountId.startsWith(`${MAIMAI_TEST_ACCOUNT_ID}:`);
}

export function parseDemoAccountProfiles(value: unknown): DemoAccountProfile[] {
  if (!value || typeof value !== 'object') return [];
  const raw = value as { version?: unknown; accounts?: unknown };
  if (raw.version !== 1 || !Array.isArray(raw.accounts)) return [];
  const seen = new Set<string>();
  const profiles: DemoAccountProfile[] = [];
  for (const candidate of raw.accounts) {
    if (!candidate || typeof candidate !== 'object') continue;
    const account = candidate as { id?: unknown; displayName?: unknown };
    if (typeof account.id !== 'string' || !isMaimaiDemoAccountId(account.id) || seen.has(account.id)) continue;
    const displayName = typeof account.displayName === 'string' ? account.displayName.trim() : '';
    if (!displayName) continue;
    seen.add(account.id);
    profiles.push({ id: account.id, displayName });
  }
  return profiles;
}

export class DemoAccountStore {
  constructor(private readonly storage: KeyValueStore = Storage) {}

  async load(): Promise<DemoAccountProfile[]> {
    try {
      const raw = await this.storage.getItem(STORE_KEY);
      return raw ? parseDemoAccountProfiles(JSON.parse(raw)) : [];
    } catch {
      await this.storage.removeItem(STORE_KEY).catch(() => undefined);
      return [];
    }
  }

  async upsert(profile: DemoAccountProfile): Promise<void> {
    const displayName = profile.displayName.trim();
    if (!isMaimaiDemoAccountId(profile.id) || !displayName) {
      throw new Error('示例账号名称不能为空');
    }
    const accounts = (await this.load()).filter((account) => account.id !== profile.id);
    const value: StoredDemoAccountsV1 = {
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
    const value: StoredDemoAccountsV1 = { version: 1, accounts };
    await this.storage.setItem(STORE_KEY, JSON.stringify(value));
  }
}

export const demoAccountStore = new DemoAccountStore();
