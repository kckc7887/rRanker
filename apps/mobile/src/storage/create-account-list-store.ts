import Storage from 'expo-sqlite/kv-store';
import { loadAccountDirectory, type KeyValueStore } from '@/storage/create-demo-account-store';

export type { KeyValueStore };
export {
  AccountDirectoryCorruptError,
  AccountDirectoryReadError,
  AccountDirectoryUnrecognizedError,
  accountDirectoryCorruptKey,
  accountDirectoryUnrecognizedKey,
  readPreservedAccountDirectory,
  restoreAccountDirectory,
} from '@/storage/create-demo-account-store';

/**
 * 按键排队的 mutation gate：只覆盖本 store 自己的读改写操作，不新建全应用大锁，
 * 也不覆盖网络 / KV / SQLite 的统一写入队列。与安全仓库同一套「按存储实例保留队列尾」的
 * 写法：同一 storage 的同一 key 上的 upsert / remove 依次执行，前一个失败只结束它自己。
 */
const mutationTails = new WeakMap<KeyValueStore, Map<string, Promise<void>>>();

function enqueueKeyMutation<T>(storage: KeyValueStore, key: string, mutation: () => Promise<T>): Promise<T> {
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

/**
 * 多账号列表 store 公共工厂（musedash/phira/tuf/local 同构）：
 * 持久化为 {version:1, accounts} 列表；读取失败、内容损坏或版本/结构无法识别时保留原键并抛错；
 * upsert 先经可选 normalize 清洗校验（无效可直接抛错），再按传入对象的主键去重追加；
 * remove 后列表为空则直接删除存储键。
 *
 * 并发语义（接口承诺）：upsert 与 remove 是读改写，同一 store key 上按调用顺序串行执行，
 * 并发 upsert 不会互相覆盖；一次失败只让该次调用 reject，后续排队任务照常执行；
 * 排在清理之后的旧任务不会把已删除的条目写回。load 是纯读取，不排队。
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

    private mutate(operation: () => Promise<TProfile[]>): Promise<TProfile[]> {
      return enqueueKeyMutation(this.storage, storeKey, operation);
    }

    upsert(profile: TProfile): Promise<TProfile[]> {
      return this.mutate(async () => {
        const next = normalize ? normalize(profile) : profile;
        const accounts = [...(await this.load()).filter((item) => keyOf(item) !== keyOf(profile)), next];
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
