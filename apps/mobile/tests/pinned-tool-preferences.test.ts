import { PinnedToolPreferencesStore } from '@rranker/sdk/features/toolbox/pinned-tool-preferences';
import { PlatePinPreferencesStore } from '@rranker/tool-maimai/state/pins';
import { CollectionPinPreferencesStore } from '@rranker/tool-chunithm/state/pins';

class MemoryStore {
  values = new Map<string, string>();
  failRead = false;
  async getItem(key: string) { if (this.failRead) throw new Error('read failed'); return this.values.get(key) ?? null; }
  async setItem(key: string, value: string) { this.values.set(key, value); }
  async removeItem(key: string) { this.values.delete(key); }
}

describe('置顶偏好持久化', () => {
  it('保留缺少插件的游戏和工具记录，并移除重复项', async () => {
    const storage = new MemoryStore();
    const store = new PinnedToolPreferencesStore(storage);
    await store.save({ maimai: ['rating', 'rating', 'uninstalled-tool'], 'uninstalled-game': ['search'] });
    await expect(store.load()).resolves.toEqual({ maimai: ['rating', 'uninstalled-tool'], 'uninstalled-game': ['search'] });
  });

  it('工具入口、牌子和收藏品分别持久化并按游戏隔离', async () => {
    const storage = new MemoryStore();
    const tools = new PinnedToolPreferencesStore(storage);
    const plates = new PlatePinPreferencesStore(storage);
    const collections = new CollectionPinPreferencesStore(storage);
    await tools.save({ maimai: ['plates'], chunithm: ['chunithm-collections'] });
    await plates.save({ maimai: [6101, 6101, 6102], custom: [1] });
    await collections.save({ chunithm: [{ kind: 'trophy', id: 1 }, { kind: 'trophy', id: 1 }, { kind: 'plate', id: 1 }] });
    await expect(plates.load()).resolves.toEqual({ maimai: [6101, 6102], custom: [1] });
    await expect(collections.load()).resolves.toEqual({ chunithm: [{ kind: 'trophy', id: 1 }, { kind: 'plate', id: 1 }] });
    await expect(tools.load()).resolves.toEqual({ maimai: ['plates'], chunithm: ['chunithm-collections'] });
  });

  it.each([
    '{invalid',
    JSON.stringify({ version: 0, pinsByGame: {} }),
    JSON.stringify({ version: 1, pinsByGame: null }),
    JSON.stringify({ version: 1, pinsByGame: { maimai: [3] } }),
  ])('重建不支持的结构，仅修改对应存储键', async raw => {
    const storage = new MemoryStore();
    storage.values.set('rranker.toolbox.pinned-tools.v1', raw);
    storage.values.set('unrelated', 'keep');
    await expect(new PinnedToolPreferencesStore(storage).load()).resolves.toEqual({});
    expect(JSON.parse(storage.values.get('rranker.toolbox.pinned-tools.v1')!)).toEqual({ version: 1, pinsByGame: {} });
    expect(storage.values.get('unrelated')).toBe('keep');
  });

  it('读取失败保留已有数据，稍后可重新读取', async () => {
    const storage = new MemoryStore();
    const store = new PinnedToolPreferencesStore(storage);
    await store.save({ maimai: ['rating'] });
    storage.failRead = true;
    await expect(store.load()).rejects.toThrow('read failed');
    storage.failRead = false;
    await expect(store.load()).resolves.toEqual({ maimai: ['rating'] });
  });
});
