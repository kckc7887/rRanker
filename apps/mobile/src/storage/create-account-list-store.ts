import Storage from 'expo-sqlite/kv-store';
import type { KeyValueStore } from '@/storage/create-demo-account-store';

export type { KeyValueStore };

/**
 * 多账号列表 store 公共工厂（musedash/phira/tuf/local 同构）：
 * 持久化为 {version:1, accounts} 列表；load 解析失败即清理坏数据返回空列表；
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

    async load(): Promise<TProfile[]> {
      try {
        const raw = await this.storage.getItem(storeKey);
        return raw ? parse(JSON.parse(raw)) : [];
      } catch {
        await this.storage.removeItem(storeKey).catch(() => undefined);
        return [];
      }
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
