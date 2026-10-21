import { LocalAccountStore } from '@/storage/local-account-store';
class MemoryKeyValueStore {
  values = new Map<string, string>();
  readGate: Promise<void> | null = null;
  failNextSet = false;
  async getItem(key: string) { await this.readGate; return this.values.get(key) ?? null; }
  async setItem(key: string, value: string) {
    if (this.failNextSet) { this.failNextSet = false; throw new Error('写入失败'); }
    this.values.set(key, value);
  }
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

  it.each(['{bad', JSON.stringify({ version: 2, accounts: [] }), JSON.stringify({ version: 1, accounts: 'invalid' }),
    JSON.stringify({ version: 1, accounts: [{ id: 'maimai:local:a', displayName: 'A' }, { id: 'maimai:local:a', displayName: 'B' }] })])(
    '不支持的目录只清空对应键：%s', async raw => {
      const storage = new MemoryKeyValueStore();
      const key = 'rranker.local-maimai-accounts.v1';
      storage.values.set(key, raw);
      storage.values.set('unrelated', 'keep');
      const store = new LocalAccountStore(storage);
      expect(await store.load()).toEqual([]);
      expect(storage.values.has(key)).toBe(false);
      expect(storage.values.get('unrelated')).toBe('keep');
      await store.upsert({ id: 'maimai:local', displayName: '新玩家' });
      expect(await store.load()).toEqual([{ id: 'maimai:local', displayName: '新玩家' }]);
    },
  );

  it('读取失败时 load 和 upsert 都保留原目录', async () => {
    const storage = new MemoryKeyValueStore();
    const store = new LocalAccountStore(storage);
    await store.upsert({ id: 'maimai:local', displayName: '甲' });
    const before = storage.values.get('rranker.local-maimai-accounts.v1');
    const read = storage.getItem;
    storage.getItem = async () => { throw new Error('io unavailable'); };
    await expect(store.load()).rejects.toThrow('io unavailable');
    await expect(store.upsert({ id: 'maimai:local', displayName: '乙' })).rejects.toThrow('io unavailable');
    expect(storage.values.get('rranker.local-maimai-accounts.v1')).toBe(before);
    storage.getItem = read;
    expect(await store.load()).toEqual([{ id: 'maimai:local', displayName: '甲' }]);
  });

  it('重置失败时报告 I/O 错误而不覆盖原值', async () => {
    const storage = new MemoryKeyValueStore();
    storage.values.set('rranker.local-maimai-accounts.v1', '{bad');
    storage.removeItem = async () => { throw new Error('reset unavailable'); };
    await expect(new LocalAccountStore(storage).load()).rejects.toThrow('reset unavailable');
    expect(storage.values.get('rranker.local-maimai-accounts.v1')).toBe('{bad');
  });
});


describe('本地账号并发写入', () => {
  const profile = (id: string) => ({ id: `maimai:local:${id}`, displayName: id.toUpperCase() });

  it('并发保存保留已有玩家及两个新增玩家', async () => {
    const storage = new MemoryKeyValueStore();
    const store = new LocalAccountStore(storage);
    await store.upsert(profile('kept'));
    const gate = Promise.withResolvers<void>();
    storage.readGate = gate.promise;
    const first = store.upsert(profile('a'));
    const second = new LocalAccountStore(storage).upsert(profile('b'));
    gate.resolve();
    await Promise.all([first, second]);
    await expect(store.load()).resolves.toEqual([profile('kept'), profile('a'), profile('b')]);
  });

  it('一次写入失败不阻塞后续保存', async () => {
    const storage = new MemoryKeyValueStore();
    storage.failNextSet = true;
    const store = new LocalAccountStore(storage);
    const failed = store.upsert(profile('a'));
    const next = store.upsert(profile('b'));
    await expect(failed).rejects.toThrow('写入失败');
    await next;
    await expect(store.load()).resolves.toEqual([profile('b')]);
  });

  it('排队的删除不被尚未完成的保存覆盖', async () => {
    const storage = new MemoryKeyValueStore();
    const gate = Promise.withResolvers<void>();
    storage.readGate = gate.promise;
    const store = new LocalAccountStore(storage);
    const saving = store.upsert(profile('a'));
    const removing = store.remove(profile('a').id);
    gate.resolve();
    await Promise.all([saving, removing]);
    await expect(store.load()).resolves.toEqual([]);
  });

  it('读取等待之前的保存提交', async () => {
    const storage = new MemoryKeyValueStore();
    const gate = Promise.withResolvers<void>();
    storage.readGate = gate.promise;
    const store = new LocalAccountStore(storage);
    const saving = store.upsert(profile('a'));
    const reading = store.load();
    gate.resolve();
    await saving;
    await expect(reading).resolves.toEqual([profile('a')]);
  });
});
