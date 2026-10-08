import Storage, { enqueueKeyMutation, type KeyValueStore } from '@/storage/key-value-storage';

export function assertAccountListEnvelope(value: unknown): { version: 1; accounts: unknown[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('不支持的账号目录');
  const raw = value as { version?: unknown; accounts?: unknown };
  if (raw.version !== 1 || !Array.isArray(raw.accounts)) throw new TypeError('不支持的账号目录');
  return { version: 1, accounts: raw.accounts };
}

export async function loadAccountDirectory<T>(storage: KeyValueStore, storeKey: string, parse: (value: unknown) => T, empty: T): Promise<T> {
  const raw = await storage.getItem(storeKey);
  if (raw === null) return empty;
  try { return parse(JSON.parse(raw)); } catch {
    await storage.removeItem(storeKey);
    return empty;
  }
}

export type DemoAccountProfile = {
  id: string;
  displayName: string;
};

type StoredDemoAccountV1 = {
  version: 1;
  account: DemoAccountProfile;
};

export function createDemoAccountStore(input: {
  storeKey: string;
  isTestAccountId: (id: string) => boolean;
  saveErrorMessage: string;
}) {
  const { storeKey, isTestAccountId, saveErrorMessage } = input;

  const parse = (value: unknown): DemoAccountProfile | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError('不支持的账号目录');
    }
    const raw = value as { version?: unknown; account?: unknown };
    if (raw.version !== 1 || !raw.account || typeof raw.account !== 'object' || Array.isArray(raw.account)) {
      throw new TypeError('不支持的账号目录');
    }
    const account = raw.account as { id?: unknown; displayName?: unknown };
    if (typeof account.id !== 'string' || !isTestAccountId(account.id)) throw new TypeError('不支持的示例账号');
    const displayName = typeof account.displayName === 'string' ? account.displayName.trim() : '';
    if (!displayName) throw new TypeError('不支持的示例账号');
    return { id: account.id, displayName };
  };

  const Store = class DemoAccountStore {
    constructor(private readonly storage: KeyValueStore = Storage) {}

    load(): Promise<DemoAccountProfile | null> {
      return enqueueKeyMutation(this.storage, storeKey, () => loadAccountDirectory(this.storage, storeKey, parse, null));
    }

    async save(profile: DemoAccountProfile): Promise<void> {
      const displayName = profile.displayName.trim();
      if (!isTestAccountId(profile.id) || !displayName) {
        throw new Error(saveErrorMessage);
      }
      const value: StoredDemoAccountV1 = {
        version: 1,
        account: { id: profile.id, displayName },
      };
      await enqueueKeyMutation(this.storage, storeKey, () => this.storage.setItem(storeKey, JSON.stringify(value)));
    }

    async remove(): Promise<void> {
      await enqueueKeyMutation(this.storage, storeKey, () => this.storage.removeItem(storeKey));
    }
  };

  return { Store };
}
