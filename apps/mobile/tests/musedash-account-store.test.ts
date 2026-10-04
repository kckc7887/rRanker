import { describe, expect, it } from 'vitest';
import { MuseDashAccountStore } from '@/storage/musedash-account-store';
class MemoryStore {
  value: string | null = null;
  async getItem() { return this.value; }
  async setItem(_key: string, value: string) { this.value = value; }
  async removeItem() { this.value = null; }
}

describe('MuseDashAccountStore', () => {
  it('keeps a versioned, deduplicated list containing profile identity only', async () => {
    const storage = new MemoryStore();
    const store = new MuseDashAccountStore(storage);
    await store.upsert({ userId: '6ea4f986ffd211e8aa980242ac110011', displayName: ' 玩家 ' });
    await store.upsert({ userId: '6ea4f986ffd211e8aa980242ac110011', displayName: '新名称' });
    await expect(store.load()).resolves.toEqual([{ userId: '6ea4f986ffd211e8aa980242ac110011', displayName: '新名称' }]);
  });

  it('目录存在不支持的条目时清空，随后允许正常绑定和解绑', async () => {
    const storage = new MemoryStore();
    storage.value = JSON.stringify({ version: 1, accounts: [{ userId: 'a', displayName: 'A' }, { userId: 'a', displayName: 'B' }] });
    const store = new MuseDashAccountStore(storage);
    expect(await store.load()).toEqual([]);
    expect(storage.value).toBeNull();
    const profile = { userId: 'a', displayName: 'A' };
    await store.upsert(profile);
    expect(await store.load()).toMatchObject([profile]);
    await store.remove('a');
    expect(await store.load()).toEqual([]);
  });
});
