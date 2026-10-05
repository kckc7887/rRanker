import { PhigrosDemoAccountStore } from '@/storage/phigros-demo-account-store';

class MemoryStore {
  values = new Map<string, string>();
  async getItem(key: string) { return this.values.get(key) ?? null; }
  async setItem(key: string, value: string) { this.values.set(key, value); }
  async removeItem(key: string) { this.values.delete(key); }
}

describe('PhigrosDemoAccountStore', () => {
  it('保存、恢复并删除固定示例账号', async () => {
    const memory = new Map<string, string>();
    const store = new PhigrosDemoAccountStore({
      getItem: async (key) => memory.get(key) ?? null,
      setItem: async (key, value) => { memory.set(key, value); },
      removeItem: async (key) => { memory.delete(key); },
    });

    await store.save({ id: 'phigros:test', displayName: ' 示例账号 ' });
    expect(await store.load()).toEqual({ id: 'phigros:test', displayName: '示例账号' });
    await store.remove();
    expect(await store.load()).toBeNull();
  });

  it.each([{ version: 2, account: {} }, { version: 1, account: { id: 'maimai:test', displayName: '旧账号' } }])(
    '不支持的示例记录清空对应键', async value => {
      const storage = new MemoryStore();
      storage.values.set('rranker.phigros-demo-account.v1', JSON.stringify(value));
      const store = new PhigrosDemoAccountStore(storage);
      expect(await store.load()).toBeNull();
      expect(storage.values.has('rranker.phigros-demo-account.v1')).toBe(false);
    },
  );
});
