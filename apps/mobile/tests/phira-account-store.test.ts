import { describe, expect, it } from 'vitest';
import { PhiraAccountStore } from '@/storage/phira-account-store';
class MemoryStore {
  value: string | null = null;
  async getItem() { return this.value; }
  async setItem(_key: string, value: string) { this.value = value; }
  async removeItem() { this.value = null; }
}

describe('PhiraAccountStore', () => {
  it('stores only public identity and deduplicates a player id', async () => {
    const storage = new MemoryStore(); const store = new PhiraAccountStore(storage);
    await store.upsert({ playerId: 323528, displayName: '尘言', avatarUrl: 'https://example.invalid/avatar' });
    await store.upsert({ playerId: 323528, displayName: '新名称', avatarUrl: null });
    await expect(store.load()).resolves.toEqual([{ playerId: 323528, displayName: '新名称', avatarUrl: null }]);
  });

  it('目录存在不支持的条目时清空，随后允许正常绑定和解绑', async () => {
    const storage = new MemoryStore();
    storage.value = JSON.stringify({ version: 1, accounts: [{ playerId: '1', displayName: 'A' }] });
    const store = new PhiraAccountStore(storage);
    expect(await store.load()).toEqual([]);
    expect(storage.value).toBeNull();
    const profile = { playerId: 1, displayName: 'A' };
    await store.upsert(profile);
    expect(await store.load()).toMatchObject([profile]);
    await store.remove(1);
    expect(await store.load()).toEqual([]);
  });
});
