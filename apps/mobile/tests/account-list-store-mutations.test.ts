import { describe, expect, it } from 'vitest';
import { createAccountListStore } from '@/storage/create-account-list-store';
import { assertAccountListEnvelope } from '@/storage/create-demo-account-store';

type Profile = { id: string; displayName: string };

function parseProfiles(value: unknown): Profile[] {
  const { accounts } = assertAccountListEnvelope(value);
  return accounts.flatMap((entry): Profile[] => {
    if (!entry || typeof entry !== 'object') return [];
    const item = entry as { id?: unknown; displayName?: unknown };
    if (typeof item.id !== 'string' || typeof item.displayName !== 'string') return [];
    return [{ id: item.id, displayName: item.displayName }];
  });
}

const { Store } = createAccountListStore<Profile>({
  storeKey: 'test:accounts',
  parse: parseProfiles,
  keyOf: (profile) => profile.id,
});

class MemoryStore {
  value: string | null = null;
  /** 前 N 次读取会停在同一个闸门上，用来把两个读改写操作的交错固定下来。 */
  blockedReads = 0;
  failNextSet = false;
  private release!: () => void;
  private readonly gate = new Promise<void>((resolve) => { this.release = resolve; });

  unblockReads() { this.release(); }

  async getItem(): Promise<string | null> {
    if (this.blockedReads > 0) {
      this.blockedReads -= 1;
      await this.gate;
    }
    return this.value;
  }

  async setItem(_key: string, value: string): Promise<void> {
    if (this.failNextSet) {
      this.failNextSet = false;
      throw new Error('写入失败');
    }
    this.value = value;
  }

  async removeItem(): Promise<void> { this.value = null; }
}

const profile = (id: string): Profile => ({ id, displayName: id.toUpperCase() });

describe('account list store mutations', () => {
  it('keeps every entry when the same store upserts concurrently', async () => {
    const storage = new MemoryStore();
    storage.blockedReads = 2;
    const store = new Store(storage);

    const first = store.upsert(profile('a'));
    const second = store.upsert(profile('b'));
    storage.unblockReads();
    await Promise.all([first, second]);

    await expect(store.load()).resolves.toEqual([profile('a'), profile('b')]);
  });

  it('keeps the non-overlapping part of two concurrent upserts of different keys', async () => {
    const storage = new MemoryStore();
    const store = new Store(storage);
    await store.upsert(profile('kept'));

    storage.blockedReads = 2;
    const first = store.upsert(profile('a'));
    const second = store.upsert(profile('b'));
    storage.unblockReads();
    await Promise.all([first, second]);

    await expect(store.load()).resolves.toEqual([profile('kept'), profile('a'), profile('b')]);
  });

  it('does not let one failed mutation block the next queued task', async () => {
    const storage = new MemoryStore();
    storage.failNextSet = true;
    const store = new Store(storage);

    const failed = store.upsert(profile('a'));
    const next = store.upsert(profile('b'));

    await expect(failed).rejects.toThrow('写入失败');
    await expect(next).resolves.toEqual([profile('b')]);
    await expect(store.load()).resolves.toEqual([profile('b')]);
  });

  it('does not let a queued upsert put a removed account back', async () => {
    const storage = new MemoryStore();
    storage.blockedReads = 1;
    const store = new Store(storage);

    const upsert = store.upsert(profile('a'));
    const remove = store.remove('a');
    storage.unblockReads();
    await Promise.all([upsert, remove]);

    await expect(store.load()).resolves.toEqual([]);
    expect(storage.value).toBeNull();
  });

  it('leaves reads unqueued so a load does not wait for a pending mutation', async () => {
    const storage = new MemoryStore();
    const store = new Store(storage);
    storage.blockedReads = 1;

    const pending = store.upsert(profile('a'));
    // 让排队的 upsert 先发出它自己的读，再确认 load 没有被同一条队列挡住。
    await Promise.resolve();
    await expect(store.load()).resolves.toEqual([]);
    storage.unblockReads();
    await pending;
    await expect(store.load()).resolves.toEqual([profile('a')]);
  });
});
