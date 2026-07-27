import Storage from 'expo-sqlite/kv-store';

type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
};

type StoredChunithmTempAccountV1 = {
  version: 1;
  enabled: true;
};

const STORE_KEY = 'rranker.chunithm-temp-account.v1';

export function parseChunithmTempAccount(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const raw = value as { version?: unknown; enabled?: unknown };
  return raw.version === 1 && raw.enabled === true;
}

/** 中二首版临时账号开关；账号本身不携带成绩或凭据。 */
export class ChunithmTempAccountStore {
  constructor(private readonly storage: KeyValueStore = Storage) {}

  async load(): Promise<boolean> {
    try {
      const raw = await this.storage.getItem(STORE_KEY);
      return raw ? parseChunithmTempAccount(JSON.parse(raw)) : false;
    } catch {
      await this.storage.removeItem(STORE_KEY).catch(() => undefined);
      return false;
    }
  }

  async enable(): Promise<void> {
    const value: StoredChunithmTempAccountV1 = { version: 1, enabled: true };
    await this.storage.setItem(STORE_KEY, JSON.stringify(value));
  }

  async remove(): Promise<void> {
    await this.storage.removeItem(STORE_KEY);
  }
}

export const chunithmTempAccountStore = new ChunithmTempAccountStore();
