import Storage from 'expo-sqlite/kv-store';
import { loadAccountDirectory, type KeyValueStore } from '@/storage/create-demo-account-store';

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

  load(): Promise<boolean> {
    return loadAccountDirectory(this.storage, STORE_KEY, parseChunithmTempAccount, false);
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
