import { ChunithmDemoAccountStore } from '@/storage/chunithm-demo-account-store';
import { createSerializedKeyValueStorage } from '@/storage/key-value-storage';

class MemoryStore {
  values = new Map<string, string>();
  async getItem(key: string) { return this.values.get(key) ?? null; }
  async setItem(key: string, value: string) { this.values.set(key, value); }
  async removeItem(key: string) { this.values.delete(key); }
  async getAllKeys() { return [...this.values.keys()]; }
}

describe('ChunithmDemoAccountStore', () => {
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

  it('保存、恢复并删除固定示例账号', async () => {
    const memory = new Map<string, string>();
    const store = new ChunithmDemoAccountStore({
      getItem: async (key) => memory.get(key) ?? null,
      setItem: async (key, value) => { memory.set(key, value); },
      removeItem: async (key) => { memory.delete(key); },
    });

    await store.save({ id: 'chunithm:test', displayName: ' 示例账号 ' });
    expect(await store.load()).toEqual({ id: 'chunithm:test', displayName: '示例账号' });
    await store.remove();
    expect(await store.load()).toBeNull();
  });

  it.each([{ version: 2, account: {} }, { version: 1, account: { id: 'maimai:test', displayName: '旧账号' } }])(
    '不支持的示例记录清空对应键', async value => {
      const storage = new MemoryStore();
      storage.values.set('rranker.chunithm-demo-account.v1', JSON.stringify(value));
      const store = new ChunithmDemoAccountStore(storage);
      expect(await store.load()).toBeNull();
      expect(storage.values.has('rranker.chunithm-demo-account.v1')).toBe(false);
    },
  );
});
