import {
  parsePhigrosDemoAccountProfile,
  PhigrosDemoAccountStore,
} from '@/storage/phigros-demo-account-store';

describe('PhigrosDemoAccountStore', () => {
  it('保存、恢复并删除固定示例账号', async () => {
    const memory = new Map<string, string>();
    const store = new PhigrosDemoAccountStore({
      getItem: async (key) => memory.get(key) ?? null,
      setItem: async (key, value) => { memory.set(key, value); },
      removeItem: async (key) => { memory.delete(key); },
    });

    await store.save({ id: 'phigros:test', displayName: ' 示例账号 ' });
    expect(await store.load()).toEqual({ id: 'phigros:test', displayName: '示例账号' });
    await store.remove();
    expect(await store.load()).toBeNull();
  });

  it('拒绝错误账号 ID 和空名称', () => {
    expect(parsePhigrosDemoAccountProfile({
      version: 1,
      account: { id: 'phigros:phi-taptap:test', displayName: '示例账号' },
    })).toBeNull();
    expect(parsePhigrosDemoAccountProfile({
      version: 1,
      account: { id: 'phigros:test', displayName: ' ' },
    })).toBeNull();
  });
});
