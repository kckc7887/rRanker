import { describe, expect, it, vi } from 'vitest';
import { createSerializedKeyValueStorage, type KeyValueStorage } from '@/storage/key-value-storage';

function fixture() {
  const values = new Map<string, string>();
  const raw: KeyValueStorage = {
    getItem: vi.fn(async (key) => values.get(key) ?? null),
    setItem: vi.fn(async (key, value) => { values.set(key, value); }),
    removeItem: vi.fn(async (key) => { values.delete(key); }),
    getAllKeys: vi.fn(async () => [...values.keys()]),
  };
  return { raw, values, storage: createSerializedKeyValueStorage(raw) };
}

describe('shared native KV execution owner', () => {
  it('serializes complete native lifetimes across keys and operation types', async () => {
    const { raw, storage } = fixture();
    let finish!: () => void;
    let active = 0;
    let maximum = 0;
    raw.setItem = vi.fn(async () => {
      maximum = Math.max(maximum, ++active);
      await new Promise<void>((resolve) => { finish = resolve; });
      active--;
    });
    const first = storage.setItem('theme', 'blue');
    const rest = [storage.getItem('session'), storage.removeItem('log'), storage.getAllKeys()];
    await Promise.resolve();
    expect(raw.getItem).not.toHaveBeenCalled();
    expect(raw.removeItem).not.toHaveBeenCalled();
    expect(raw.getAllKeys).not.toHaveBeenCalled();
    finish();
    await Promise.all([first, ...rest]);
    expect(maximum).toBe(1);
    expect(raw.getItem).toHaveBeenCalledWith('session');
    expect(raw.removeItem).toHaveBeenCalledWith('log');
    expect(raw.getAllKeys).toHaveBeenCalledOnce();
  });

  it('preserves the original rejection and continues queued work', async () => {
    const { raw, storage } = fixture();
    const failure = new Error('statement unavailable');
    vi.mocked(raw.setItem).mockRejectedValueOnce(failure);
    const rejected = storage.setItem('first', 'value');
    const recovered = storage.setItem('next', 'retained');
    await expect(rejected).rejects.toBe(failure);
    await recovered;
    expect(await storage.getItem('next')).toBe('retained');
  });

  it('reuses the same owner for one raw instance and never serializes another instance with it', async () => {
    const first = fixture();
    const second = fixture();
    expect(createSerializedKeyValueStorage(first.raw)).toBe(first.storage);
    expect(createSerializedKeyValueStorage(first.storage)).toBe(first.storage);
    expect(second.storage).not.toBe(first.storage);
    let release!: () => void;
    first.raw.setItem = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const blocked = first.storage.setItem('first', 'value');
    await Promise.resolve();
    await second.storage.setItem('second', 'value');
    expect(second.values.get('second')).toBe('value');
    release();
    await blocked;
  });
});
