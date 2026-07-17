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
