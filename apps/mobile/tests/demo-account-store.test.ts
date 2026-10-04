import { describe, expect, it } from 'vitest';
import { DemoAccountStore } from '@/storage/demo-account-store';
class MemoryStore {
  values = new Map<string, string>();
  async getItem(key: string) { return this.values.get(key) ?? null; }
  async setItem(key: string, value: string) { this.values.set(key, value); }
  async removeItem(key: string) { this.values.delete(key); }
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
