import Storage from 'expo-sqlite/kv-store';
import { loadAccountDirectory, type KeyValueStore } from '@/storage/create-demo-account-store';

export type { KeyValueStore };
export { AccountDirectoryCorruptError, AccountDirectoryReadError, accountDirectoryCorruptKey } from '@/storage/create-demo-account-store';

/**
 * 多账号列表 store 公共工厂（musedash/phira/tuf/local 同构）：
 * 持久化为 {version:1, accounts} 列表；读取失败或内容损坏时保留原键并抛错；
 * upsert 先经可选 normalize 清洗校验（无效可直接抛错），再按传入对象的主键去重追加；
 * remove 后列表为空则直接删除存储键。
 */
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

    async upsert(profile: TProfile): Promise<TProfile[]> {
      const next = normalize ? normalize(profile) : profile;
      const accounts = [...(await this.load()).filter((item) => keyOf(item) !== keyOf(profile)), next];
      await this.save(accounts);
      return accounts;
    }

    async remove(key: unknown): Promise<TProfile[]> {
      const accounts = (await this.load()).filter((item) => keyOf(item) !== key);
      if (accounts.length === 0) await this.storage.removeItem(storeKey);
      else await this.save(accounts);
      return accounts;
    }
  };

  return { Store };
}
