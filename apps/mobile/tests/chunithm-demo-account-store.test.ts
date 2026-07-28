import {
  ChunithmDemoAccountStore,
  parseChunithmDemoAccountProfile,
} from '@/storage/chunithm-demo-account-store';

describe('ChunithmDemoAccountStore', () => {
  it('保存、恢复并删除固定示例账号', async () => {
    const memory = new Map<string, string>();
    const store = new ChunithmDemoAccountStore({
      getItem: async (key) => memory.get(key) ?? null,
      setItem: async (key, value) => { memory.set(key, value); },
      removeItem: async (key) => { memory.delete(key); },
    });

    await store.save({ id: 'chunithm:test', displayName: ' 示例账号 ' });
    expect(await store.load()).toEqual({ id: 'chunithm:test', displayName: '示例账号' });
    await store.remove();
    expect(await store.load()).toBeNull();
  });

  it('拒绝错误账号 ID 和空名称', () => {
    expect(parseChunithmDemoAccountProfile({
      version: 1,
      account: { id: 'maimai:test', displayName: '示例账号' },
    })).toBeNull();
    expect(parseChunithmDemoAccountProfile({
      version: 1,
      account: { id: 'chunithm:test', displayName: ' ' },
    })).toBeNull();
  });
});
