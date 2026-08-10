import { describe, expect, it } from 'vitest';
import { MuseDashAccountStore, parseMuseDashAccounts } from '@/storage/musedash-account-store';

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
    expect(storage.value).toContain('"version":1');
    expect(storage.value).not.toMatch(/token|session|plays|rl|score/i);
  });

  it('drops malformed and duplicate entries and removes the key after unbinding the last player', async () => {
    expect(parseMuseDashAccounts({ version: 1, accounts: [
      { userId: 'a', displayName: 'A' }, { userId: 'a', displayName: 'B' },
      { userId: '', displayName: 'C' }, { userId: 'd', displayName: '  ' },
      { userId: 5, displayName: 'E' },
    ] })).toEqual([{ userId: 'a', displayName: 'A' }]);
    const storage = new MemoryStore();
    const store = new MuseDashAccountStore(storage);
    await store.upsert({ userId: 'a', displayName: 'A' });
    await expect(store.remove('a')).resolves.toEqual([]);
    expect(storage.value).toBeNull();
  });
});
