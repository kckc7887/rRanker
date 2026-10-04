import Storage from '@/storage/key-value-storage';
import { loadAccountDirectory, type KeyValueStore } from '@/storage/create-demo-account-store';

type StoredChunithmTempAccountV1 = {
  version: 1;
  enabled: true;
};

const STORE_KEY = 'rranker.chunithm-temp-account.v1';

function parseChunithmTempAccount(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('不支持的中二账号设置');
  }
  const raw = value as { version?: unknown; enabled?: unknown };
  if (raw.version !== 1 || typeof raw.enabled !== 'boolean') {
    throw new TypeError('不支持的中二账号设置');
  }
  return raw.enabled;
}

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
