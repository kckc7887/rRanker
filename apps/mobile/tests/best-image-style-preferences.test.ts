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
    await store.save('account-a', { icon: { mode: 'off' } }, 'app');
    await store.save('account-b', { frame: { mode: 'item', item: { id: 9, kind: 'frame', name: '背景', requirements: [] } } }, 'game');
    expect((await store.load('account-a')).selections).toEqual({ icon: { mode: 'off' } });
    expect((await store.load('account-a')).ratingStyle).toBe('app');
    expect((await store.load('account-b')).selections.frame).toMatchObject({ mode: 'item', item: { id: 9, kind: 'frame' } });
    expect((await store.load('account-b')).ratingStyle).toBe('game');
  });

  it('drops invalid or mismatched collection items', () => {
    expect(parseBestImageStylePreferences({ version: 3, selections: {
      icon: { mode: 'item', item: { id: 1, kind: 'plate', name: '错误类型' } },
      trophy: { mode: 'random', item: { id: 2, kind: 'trophy', name: '称号', color: 'Rainbow' } },
    } }).selections).toEqual({
      trophy: { mode: 'random', item: { id: 2, kind: 'trophy', name: '称号', color: 'Rainbow', requirements: [] } },
    });
  });

  it('rebuilds malformed JSON with current defaults', async () => {
    const storage = new MemoryStore();
    storage.values.set('rranker.best-image.styles.v1:a', '{');
    const store = new BestImageStylePreferencesStore(storage);
    await expect(store.load('a')).resolves.toEqual({ version: 3, selections: {}, ratingStyle: 'game' });
    expect(JSON.parse(storage.values.get('rranker.best-image.styles.v1:a')!)).toEqual({ version: 3, selections: {}, ratingStyle: 'game' });
  });

  it('propagates storage errors', async () => {
    const storage = new MemoryStore();
    storage.getItem = async () => { throw new Error('database unavailable'); };
    storage.removeItem = async () => { throw new Error('database unavailable'); };
    const store = new BestImageStylePreferencesStore(storage);
    await expect(store.load('a')).rejects.toThrow('database unavailable');
    expect(storage.values.size).toBe(0);
  });
  it.each([
    { version: 2, selections: { icon: { mode: 'off' } }, ratingStyle: 'app-rect' },
    { version: 3, selections: { icon: { mode: 'item' } }, ratingStyle: 'app' },
    { version: 3, selections: { icon: { mode: 'item', item: { id: 1, kind: 'plate', name: '名牌' } } }, ratingStyle: 'app' },
  ])('rebuilds unsupported styles only for the selected account', async value => {
    const storage = new MemoryStore(), store = new BestImageStylePreferencesStore(storage);
    await store.save('b', { frame: { mode: 'off' } }, 'app');
    const other = storage.values.get('rranker.best-image.styles.v1:b');
    storage.values.set('rranker.best-image.styles.v1:a', JSON.stringify(value));
    await expect(store.load('a')).resolves.toEqual({ version: 3, selections: {}, ratingStyle: 'game' });
    expect(JSON.parse(storage.values.get('rranker.best-image.styles.v1:a')!)).toEqual({ version: 3, selections: {}, ratingStyle: 'game' });
    expect(storage.values.get('rranker.best-image.styles.v1:b')).toBe(other);
  });

});
