import { describe, expect, it } from 'vitest';
import { parseTufAccounts, TufAccountStore } from '@/storage/tuf-account-store';

class MemoryStore {
  value: string | null = null;
  async getItem() { return this.value; }
  async setItem(_key: string, value: string) { this.value = value; }
  async removeItem() { this.value = null; }
}

describe('TufAccountStore', () => {
  it('keeps a versioned, deduplicated list containing profile identity only', async () => {
    const storage = new MemoryStore();
    const store = new TufAccountStore(storage);
    await store.upsert({ playerId: 25, displayName: ' 玩家 ', avatarUrl: 'https://cdn.example/avatar.png' });
    await store.upsert({ playerId: 25, displayName: '新名称', avatarUrl: null });
    await expect(store.load()).resolves.toEqual([{ playerId: 25, displayName: '新名称', avatarUrl: null }]);
    expect(storage.value).toContain('"version":1');
    expect(storage.value).not.toMatch(/token|session|passes|topScores|rankedScore/i);
  });

  it('drops malformed and duplicate entries and removes the key after unbinding the last player', async () => {
    expect(parseTufAccounts({ version: 1, accounts: [
      { playerId: 1, displayName: 'A' }, { playerId: 1, displayName: 'B' }, { playerId: 0, displayName: 'C' },
    ] })).toEqual([{ playerId: 1, displayName: 'A', avatarUrl: null }]);
    const storage = new MemoryStore();
    const store = new TufAccountStore(storage);
    await store.upsert({ playerId: 1, displayName: 'A' });
    await expect(store.remove(1)).resolves.toEqual([]);
    expect(storage.value).toBeNull();
  });
});
