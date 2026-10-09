import { ChunithmTempAccountStore } from '@/storage/chunithm-temp-account-store';
import { createSerializedKeyValueStorage } from '@/storage/key-value-storage';
class MemoryStore {
  values = new Map<string, string>();
  async getItem(key: string) { return this.values.get(key) ?? null; }
  async setItem(key: string, value: string) { this.values.set(key, value); }
  async removeItem(key: string) { this.values.delete(key); }
  async getAllKeys() { return [...this.values.keys()]; }
}

describe('ChunithmTempAccountStore', () => {
  it('重建失效设置时保留随后启用的临时账号', async () => {
    const memory = new MemoryStore();
    memory.values.set('rranker.chunithm-temp-account.v1', JSON.stringify({ version: 0 }));
    const storage = createSerializedKeyValueStorage(memory);
    const reading = new ChunithmTempAccountStore(storage).load();
    const enabling = new ChunithmTempAccountStore(storage).enable();
    await expect(reading).resolves.toBe(false);
    await enabling;
    await expect(new ChunithmTempAccountStore(storage).load()).resolves.toBe(true);
  });

  it('persists and removes the no-score temporary account flag', async () => {
    const memory = new Map<string, string>();
    const store = new ChunithmTempAccountStore({
      getItem: async (key) => memory.get(key) ?? null,
      setItem: async (key, value) => { memory.set(key, value); },
      removeItem: async (key) => { memory.delete(key); },
    });

    expect(await store.load()).toBe(false);
    await store.enable();
    expect(await store.load()).toBe(true);
    await store.remove();
    expect(await store.load()).toBe(false);
  });

  it('不支持的设置重置为未启用', async () => {
    const storage = new MemoryStore();
    storage.values.set('rranker.chunithm-temp-account.v1', JSON.stringify({ version: 2, enabled: true }));
    expect(await new ChunithmTempAccountStore(storage).load()).toBe(false);
    expect(storage.values.size).toBe(0);
  });
});
