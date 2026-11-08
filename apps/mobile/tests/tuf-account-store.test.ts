import { describe, expect, it } from 'vitest';
import { TufAccountStore } from '@rranker/provider-tuf/storage/tuf-account-store';
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
  });

  it('目录存在不支持的条目时清空，随后允许正常绑定和解绑', async () => {
    const storage = new MemoryStore();
    storage.value = JSON.stringify({ version: 1, accounts: [{ playerId: 1, displayName: 'A' }, { playerId: 1, displayName: 'B' }] });
    const store = new TufAccountStore(storage);
    expect(await store.load()).toEqual([]);
    expect(storage.value).toBeNull();
    const profile = { playerId: 1, displayName: 'A' };
    await store.upsert(profile);
    expect(await store.load()).toMatchObject([profile]);
    await store.remove(1);
    expect(await store.load()).toEqual([]);
  });

  it('读取期间取消绑定时保留原账号目录', async () => {
    const storage = new MemoryStore();
    const store = new TufAccountStore(storage);
    await store.upsert({ playerId: 1, displayName: '已有玩家' });
    const previous = storage.value;
    let release!: () => void;
    let reading!: () => void;
    const started = new Promise<void>(resolve => { reading = resolve; });
    storage.getItem = async () => {
      reading();
      await new Promise<void>(resolve => { release = resolve; });
      return previous;
    };
    const controller = new AbortController();
    const binding = store.upsert({ playerId: 2, displayName: '迟到玩家' }, () => controller.signal.throwIfAborted());
    const rejected = expect(binding).rejects.toThrow();
    await started;
    controller.abort();
    release();
    await rejected;
    expect(storage.value).toBe(previous);
  });
});
