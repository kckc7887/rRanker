import {
  ChunithmTempAccountStore,
  parseChunithmTempAccount,
} from '@/storage/chunithm-temp-account-store';

describe('ChunithmTempAccountStore', () => {
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

  it('accepts only the versioned enabled payload', () => {
    expect(parseChunithmTempAccount({ version: 1, enabled: true })).toBe(true);
    expect(parseChunithmTempAccount({ version: 1, enabled: false })).toBe(false);
    expect(parseChunithmTempAccount({ version: 2, enabled: true })).toBe(false);
    expect(parseChunithmTempAccount(null)).toBe(false);
  });
});
