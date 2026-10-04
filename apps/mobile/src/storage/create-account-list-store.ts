import Storage from '@/storage/key-value-storage';
import { loadAccountDirectory, type KeyValueStore } from '@/storage/create-demo-account-store';

export type { KeyValueStore };
const mutationTails = new WeakMap<KeyValueStore, Map<string, Promise<void>>>();

export function enqueueKeyMutation<T>(storage: KeyValueStore, key: string, mutation: () => Promise<T>): Promise<T> {
  let tails = mutationTails.get(storage);
  if (!tails) {
    tails = new Map();
    mutationTails.set(storage, tails);
  }
  const previous = tails.get(key) ?? Promise.resolve();
  const result = previous.then(mutation, mutation);
  const tail = result.then(() => undefined, () => undefined);
  tails.set(key, tail);
  return result.finally(() => {
    if (tails.get(key) === tail) tails.delete(key);
  });
}

export function createAccountListStore<TProfile>(input: {
  storeKey: string;
  parse: (value: unknown) => TProfile[];
  keyOf: (profile: TProfile) => unknown;
  normalize?: (profile: TProfile) => TProfile;
}) {
  const { storeKey, parse, keyOf, normalize } = input;

  const Store = class AccountListStore {
    constructor(private readonly storage: KeyValueStore = Storage) {}

    load(): Promise<TProfile[]> {
      return loadAccountDirectory(this.storage, storeKey, parse, []);
    }

    private async save(accounts: TProfile[]): Promise<void> {
      await this.storage.setItem(storeKey, JSON.stringify({ version: 1, accounts }));
    }

    private mutate(operation: () => Promise<TProfile[]>): Promise<TProfile[]> {
      return enqueueKeyMutation(this.storage, storeKey, operation);
    }

    upsert(profile: TProfile): Promise<TProfile[]> {
      return this.mutate(async () => {
        const next = normalize ? normalize(profile) : profile;
        const accounts = [...(await this.load()).filter((item) => keyOf(item) !== keyOf(next)), next];
        await this.save(accounts);
        return accounts;
      });
    }

    remove(key: unknown): Promise<TProfile[]> {
      return this.mutate(async () => {
        const accounts = (await this.load()).filter((item) => keyOf(item) !== key);
        if (accounts.length === 0) await this.storage.removeItem(storeKey);
        else await this.save(accounts);
        return accounts;
      });
    }
  };

  return { Store };
}
