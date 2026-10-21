import { describe, expect, it } from 'vitest';
import { MUSEDASH_TEST_ACCOUNT_ID } from '@/domain/bound-account';
import { DemoAccountStore } from '@/storage/demo-account-store';
import { ChunithmDemoAccountStore } from '@/storage/chunithm-demo-account-store';
import { PhigrosDemoAccountStore } from '@/storage/phigros-demo-account-store';
import { MuseDashDemoAccountStore } from '@/storage/musedash-demo-account-store';
import { createSerializedKeyValueStorage } from '@/storage/key-value-storage';
class MemoryStore {
  values = new Map<string, string>();
  async getItem(key: string) { return this.values.get(key) ?? null; }
  async setItem(key: string, value: string) { this.values.set(key, value); }
  async removeItem(key: string) { this.values.delete(key); }
  async getAllKeys() { return [...this.values.keys()]; }
}

describe('DemoAccountStore', () => {
  it('upserts and removes demo profiles', async () => {
    const memory = new Map<string, string>();
    const store = new DemoAccountStore({
      getItem: async (key) => memory.get(key) ?? null,
      setItem: async (key, value) => { memory.set(key, value); },
      removeItem: async (key) => { memory.delete(key); },
    });

    await store.upsert({ id: 'maimai:test', displayName: '示例账号' });
    expect(await store.load()).toEqual([{ id: 'maimai:test', displayName: '示例账号' }]);

    await store.remove('maimai:test');
    expect(await store.load()).toEqual([]);
  });

  it('不支持的示例目录清空对应键', async () => {
    const storage = new MemoryStore();
    storage.values.set('rranker.maimai-demo-accounts.v1', JSON.stringify({ version: 1, accounts: [
      { id: 'maimai:test', displayName: '示例' }, { id: 'maimai:local', displayName: '本地' },
    ] }));
    expect(await new DemoAccountStore(storage).load()).toEqual([]);
    expect(storage.values.size).toBe(0);
  });
});


describe('单账号示例保存', () => {
  it('分别保存各游戏的名称，删除一项不影响其它游戏', async () => {
    const storage = new MemoryStore();
    const stores = [
      { store: new ChunithmDemoAccountStore(storage), id: 'chunithm:test' },
      { store: new PhigrosDemoAccountStore(storage), id: 'phigros:test' },
      { store: new MuseDashDemoAccountStore(storage), id: MUSEDASH_TEST_ACCOUNT_ID },
    ];
    for (const { store, id } of stores) await store.save({ id, displayName: ` ${id} 玩家 ` });
    for (const { store, id } of stores) {
      await expect(store.load()).resolves.toEqual({ id, displayName: `${id} 玩家` });
    }
    await stores[1].store.remove();
    await expect(stores[1].store.load()).resolves.toBeNull();
    await expect(stores[0].store.load()).resolves.toEqual({ id: 'chunithm:test', displayName: 'chunithm:test 玩家' });
    await expect(stores[2].store.load()).resolves.toEqual({ id: MUSEDASH_TEST_ACCOUNT_ID, displayName: `${MUSEDASH_TEST_ACCOUNT_ID} 玩家` });
  });

  it.each([{ version: 2, account: {} }, { version: 1, account: { id: 'maimai:test', displayName: '玩家' } }])(
    '不支持的记录只清除所属游戏键', async value => {
      const storage = new MemoryStore();
      const other = new MuseDashDemoAccountStore(storage);
      await other.save({ id: MUSEDASH_TEST_ACCOUNT_ID, displayName: '保留玩家' });
      storage.values.set('rranker.phigros-demo-account.v1', JSON.stringify(value));
      await expect(new PhigrosDemoAccountStore(storage).load()).resolves.toBeNull();
      expect(storage.values.has('rranker.phigros-demo-account.v1')).toBe(false);
      await expect(other.load()).resolves.toEqual({ id: MUSEDASH_TEST_ACCOUNT_ID, displayName: '保留玩家' });
    },
  );

  it('重建失效目录时保留另一实例随后保存的账号', async () => {
    const memory = new MemoryStore();
    memory.values.set('rranker.chunithm-demo-account.v1', JSON.stringify({ version: 0 }));
    const storage = createSerializedKeyValueStorage(memory);
    const reading = new ChunithmDemoAccountStore(storage).load();
    const account = { id: 'chunithm:test', displayName: '新账号' };
    const saving = new ChunithmDemoAccountStore(storage).save(account);
    await expect(reading).resolves.toBeNull();
    await saving;
    await expect(new ChunithmDemoAccountStore(storage).load()).resolves.toEqual(account);
  });
});
