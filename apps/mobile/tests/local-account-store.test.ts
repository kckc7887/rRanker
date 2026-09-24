import {
  AccountDirectoryCorruptError,
  AccountDirectoryReadError,
  AccountDirectoryUnrecognizedError,
  accountDirectoryCorruptKey,
  accountDirectoryUnrecognizedKey,
  readPreservedAccountDirectory,
  restoreAccountDirectory,
} from '@/storage/create-demo-account-store';
import {
  LocalAccountStore,
  normalizeLocalPlayerName,
  parseLocalAccountProfiles,
} from '@/storage/local-account-store';

class MemoryKeyValueStore {
  values = new Map<string, string>();

  async getItem(key: string) { return this.values.get(key) ?? null; }
  async setItem(key: string, value: string) { this.values.set(key, value); }
  async removeItem(key: string) { this.values.delete(key); }
}

describe('LocalAccountStore', () => {
  it('持久化多个本地玩家，并支持独立改名和删除', async () => {
    const storage = new MemoryKeyValueStore();
    const store = new LocalAccountStore(storage);
    await store.upsert({ id: 'maimai:local', displayName: '默认玩家' });
    await store.upsert({ id: 'maimai:local:alice', displayName: 'Alice' });
    await store.upsert({ id: 'maimai:local:bob', displayName: 'Bob' });

    expect(await store.load()).toEqual([
      { id: 'maimai:local', displayName: '默认玩家' },
      { id: 'maimai:local:alice', displayName: 'Alice' },
      { id: 'maimai:local:bob', displayName: 'Bob' },
    ]);

    await store.upsert({ id: 'maimai:local:alice', displayName: 'Alice 新名称' });
    await store.remove('maimai:local:bob');
    expect(await store.load()).toEqual([
      { id: 'maimai:local', displayName: '默认玩家' },
      { id: 'maimai:local:alice', displayName: 'Alice 新名称' },
    ]);
  });

  it('暂时读失败时保留原账号目录', async () => {
    const storage = new MemoryKeyValueStore();
    const store = new LocalAccountStore(storage);
    await store.upsert({ id: 'maimai:local', displayName: '甲' });
    await store.upsert({ id: 'maimai:local:alice', displayName: '乙' });
    const preserved = storage.values.get('rranker.local-maimai-accounts.v1');
    storage.getItem = async () => { throw new Error('temporary io'); };

    await expect(store.load()).rejects.toBeInstanceOf(AccountDirectoryReadError);
    expect(storage.values.get('rranker.local-maimai-accounts.v1')).toBe(preserved);

    storage.getItem = MemoryKeyValueStore.prototype.getItem;
    expect(await store.load()).toEqual([
      { id: 'maimai:local', displayName: '甲' },
      { id: 'maimai:local:alice', displayName: '乙' },
    ]);
  });

  it('内容损坏时保留原键和副本，不把目录当成空列表', async () => {
    const storage = new MemoryKeyValueStore();
    const raw = '{not-json';
    storage.values.set('rranker.local-maimai-accounts.v1', raw);
    const store = new LocalAccountStore(storage);

    await expect(store.load()).rejects.toBeInstanceOf(AccountDirectoryCorruptError);
    expect(storage.values.get('rranker.local-maimai-accounts.v1')).toBe(raw);
    expect(storage.values.get(accountDirectoryCorruptKey('rranker.local-maimai-accounts.v1'))).toBe(raw);
  });

  it('未知版本或错误结构时拒绝覆盖，并保留原文', async () => {
    const storage = new MemoryKeyValueStore();
    const store = new LocalAccountStore(storage);
    const key = 'rranker.local-maimai-accounts.v1';
    const unknownVersion = JSON.stringify({ version: 2, accounts: [{ id: 'maimai:local', displayName: '未来玩家' }] });
    storage.values.set(key, unknownVersion);
    await expect(store.load()).rejects.toBeInstanceOf(AccountDirectoryUnrecognizedError);
    await expect(store.upsert({ id: 'maimai:local', displayName: '新玩家' })).rejects.toBeInstanceOf(AccountDirectoryUnrecognizedError);
    expect(storage.values.get(key)).toBe(unknownVersion);
    expect(storage.values.get(accountDirectoryUnrecognizedKey(key))).toBe(unknownVersion);
    expect(await readPreservedAccountDirectory(storage, key)).toBe(unknownVersion);
    await expect(restoreAccountDirectory(storage, key, '{', parseLocalAccountProfiles))
      .rejects.toBeInstanceOf(AccountDirectoryUnrecognizedError);
    expect(storage.values.get(key)).toBe(unknownVersion);

    const invalidShape = JSON.stringify({ version: 1, accounts: 'nope' });
    storage.values.set(key, invalidShape);
    await expect(store.load()).rejects.toMatchObject({ reason: 'invalid-structure' });
    await expect(store.remove('maimai:local')).rejects.toBeInstanceOf(AccountDirectoryUnrecognizedError);
    expect(storage.values.get(key)).toBe(invalidShape);

    const restored = JSON.stringify({ version: 1, accounts: [{ id: 'maimai:local', displayName: '恢复玩家' }] });
    await expect(restoreAccountDirectory(storage, key, restored, parseLocalAccountProfiles)).resolves.toEqual([
      { id: 'maimai:local', displayName: '恢复玩家' },
    ]);
    expect(storage.values.get(key)).toBe(restored);
  });

  it('读取失败时 upsert 不写入', async () => {
    const storage = new MemoryKeyValueStore();
    const original = storage.getItem.bind(storage);
    storage.getItem = async () => { throw new Error('io'); };
    const store = new LocalAccountStore(storage);
    await expect(store.load()).rejects.toBeInstanceOf(AccountDirectoryReadError);
    await expect(store.upsert({ id: 'maimai:local', displayName: '新玩家' })).rejects.toBeInstanceOf(AccountDirectoryReadError);
    storage.getItem = original;
    expect(storage.values.size).toBe(0);
  });

  it('过滤损坏、重复或非本地账号数据', () => {
    expect(parseLocalAccountProfiles({
      version: 1,
      accounts: [
        { id: 'maimai:local:a', displayName: '  玩家 A  ' },
        { id: 'maimai:local:a', displayName: '重复项' },
        { id: 'maimai:lxns:1', displayName: '远程账号' },
        { id: 'maimai:local:b', displayName: '   ' },
      ],
    })).toEqual([{ id: 'maimai:local:a', displayName: '玩家 A' }]);
    expect(normalizeLocalPlayerName('   ')).toBeNull();
  });
});
