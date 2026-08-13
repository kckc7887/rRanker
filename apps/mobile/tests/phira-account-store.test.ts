import { describe, expect, it, vi } from 'vitest';
import { parsePhiraAccounts, PhiraAccountStore } from '@/storage/phira-account-store';
vi.mock('expo-sqlite/kv-store', () => ({ default: {} }));

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
    expect(storage.value).not.toMatch(/password|token|email/i);
  });

  it('rejects malformed public profiles and removes the final binding', async () => {
    expect(parsePhiraAccounts({ version: 1, accounts: [
      { playerId: 1, displayName: 'A' }, { playerId: 1, displayName: 'B' }, { playerId: -1, displayName: 'C' },
    ] })).toEqual([{ playerId: 1, displayName: 'A', avatarUrl: null }]);
    const storage = new MemoryStore(); const store = new PhiraAccountStore(storage);
    await store.upsert({ playerId: 1, displayName: 'A' });
    await expect(store.remove(1)).resolves.toEqual([]);
    expect(storage.value).toBeNull();
  });
});
