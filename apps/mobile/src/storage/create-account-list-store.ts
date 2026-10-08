import Storage, { enqueueKeyMutation, type KeyValueStore } from '@/storage/key-value-storage';
import { loadAccountDirectory } from '@/storage/create-demo-account-store';

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
      return this.mutate(() => this.read());
    }

    private read(): Promise<TProfile[]> {
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
        const accounts = [...(await this.read()).filter((item) => keyOf(item) !== keyOf(next)), next];
        await this.save(accounts);
        return accounts;
      });
    }

    remove(key: unknown): Promise<TProfile[]> {
      return this.mutate(async () => {
        const accounts = (await this.read()).filter((item) => keyOf(item) !== key);
        if (accounts.length === 0) await this.storage.removeItem(storeKey);
        else await this.save(accounts);
        return accounts;
      });
    }
  };

  return { Store };
}
