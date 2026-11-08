import { createPinsStore, type PinsByGame } from '@rranker/sdk/state/pins';

class MemoryPreferences {
  value: PinsByGame<string> = {};
  failLoad = false;
  failSave = false;
  async load() { if (this.failLoad) throw new Error('read failed'); return this.value; }
  async save(value: PinsByGame<string>) {
    if (this.failSave) throw new Error('database unavailable');
    this.value = value;
  }
}

describe('置顶状态', () => {
  it('读取后按游戏新增和取消置顶，保留未安装插件记录', async () => {
    const preferences = new MemoryPreferences();
    preferences.value = { missing: ['custom'], maimai: ['rating'] };
    const store = createPinsStore(preferences);
    await store.getState().toggle('maimai', 'plates');
    expect(store.getState().pinsByGame).toEqual({ missing: ['custom'], maimai: ['rating', 'plates'] });
    await store.getState().toggle('maimai', 'rating');
    expect(preferences.value).toEqual({ missing: ['custom'], maimai: ['plates'] });
  });

  it('并行操作顺序保存，跨游戏不覆盖', async () => {
    const preferences = new MemoryPreferences();
    const store = createPinsStore(preferences);
    await Promise.all([store.getState().toggle('maimai', 'rating'), store.getState().toggle('chunithm', 'collections'), store.getState().toggle('maimai', 'plates')]);
    expect(preferences.value).toEqual({ maimai: ['rating', 'plates'], chunithm: ['collections'] });
  });

  it('保存失败恢复当前记录，下一次保存仍可继续', async () => {
    const preferences = new MemoryPreferences();
    preferences.value = { maimai: ['rating'] };
    const store = createPinsStore(preferences);
    preferences.failSave = true;
    await expect(store.getState().toggle('maimai', 'plates')).rejects.toThrow('database unavailable');
    expect(store.getState().pinsByGame).toEqual({ maimai: ['rating'] });
    preferences.failSave = false;
    await store.getState().toggle('maimai', 'versions');
    expect(preferences.value).toEqual({ maimai: ['rating', 'versions'] });
  });

  it('读取失败不以空记录覆盖存储，可重试恢复', async () => {
    const preferences = new MemoryPreferences();
    preferences.value = { maimai: ['rating'] };
    preferences.failLoad = true;
    const store = createPinsStore(preferences);
    await expect(store.getState().toggle('maimai', 'plates')).rejects.toThrow('read failed');
    expect(preferences.value).toEqual({ maimai: ['rating'] });
    preferences.failLoad = false;
    await store.getState().hydrate();
    expect(store.getState().pinsByGame).toEqual({ maimai: ['rating'] });
  });
});
