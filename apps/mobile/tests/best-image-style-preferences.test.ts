import { describe, expect, it } from 'vitest';
import {
  BestImageStylePreferencesStore,
  parseBestImageStylePreferences,
} from '@/features/best-image/best-image-style-preferences';

class MemoryStore {
  values = new Map<string, string>();
  async getItem(key: string) { return this.values.get(key) ?? null; }
  async setItem(key: string, value: string) { this.values.set(key, value); }
  async removeItem(key: string) { this.values.delete(key); }
}

describe('best image style preferences', () => {
  it('keeps account selections isolated', async () => {
    const storage = new MemoryStore();
    const store = new BestImageStylePreferencesStore(storage);
    await store.save('account-a', { icon: { mode: 'off' } });
    await store.save('account-b', { frame: { mode: 'item', item: { id: 9, kind: 'frame', name: '背景', requirements: [] } } });
    expect((await store.load('account-a')).selections).toEqual({ icon: { mode: 'off' } });
    expect((await store.load('account-b')).selections.frame).toMatchObject({ mode: 'item', item: { id: 9, kind: 'frame' } });
  });

  it('drops invalid or mismatched collection items', () => {
    expect(parseBestImageStylePreferences({ version: 1, selections: {
      icon: { mode: 'item', item: { id: 1, kind: 'plate', name: '错误类型' } },
      trophy: { mode: 'random', item: { id: 2, kind: 'trophy', name: '称号', color: 'Rainbow' } },
    } }).selections).toEqual({
      trophy: { mode: 'random', item: { id: 2, kind: 'trophy', name: '称号', color: 'Rainbow', requirements: [] } },
    });
  });

  it('clears malformed JSON', async () => {
    const storage = new MemoryStore();
    storage.values.set('rranker.best-image.styles.v1:a', '{');
    const store = new BestImageStylePreferencesStore(storage);
    await expect(store.load('a')).resolves.toEqual({ version: 1, selections: {} });
    expect(storage.values.size).toBe(0);
  });

  it('falls back without blocking the preview when storage is unavailable', async () => {
    const storage = new MemoryStore();
    storage.getItem = async () => { throw new Error('database unavailable'); };
    storage.removeItem = async () => { throw new Error('database unavailable'); };
    const store = new BestImageStylePreferencesStore(storage);
    await expect(store.load('a')).resolves.toEqual({ version: 1, selections: {} });
  });
});
