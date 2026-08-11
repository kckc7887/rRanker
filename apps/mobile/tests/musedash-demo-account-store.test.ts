import {
  MuseDashDemoAccountStore,
  parseMuseDashDemoAccountProfile,
} from '@/storage/musedash-demo-account-store';
import { MUSEDASH_TEST_ACCOUNT_ID } from '@/domain/bound-account';

describe('MuseDashDemoAccountStore', () => {
  it('保存、恢复并删除固定示例账号', async () => {
    const memory = new Map<string, string>();
    const store = new MuseDashDemoAccountStore({
      getItem: async (key) => memory.get(key) ?? null,
      setItem: async (key, value) => { memory.set(key, value); },
      removeItem: async (key) => { memory.delete(key); },
    });

    await store.save({ id: MUSEDASH_TEST_ACCOUNT_ID, displayName: ' 示例账号 ' });
    expect(await store.load()).toEqual({ id: MUSEDASH_TEST_ACCOUNT_ID, displayName: '示例账号' });
    await store.remove();
    expect(await store.load()).toBeNull();
  });

  it('拒绝错误账号 ID 和空名称', () => {
    expect(parseMuseDashDemoAccountProfile({
      version: 1,
      account: { id: 'maimai:test', displayName: '示例账号' },
    })).toBeNull();
    expect(parseMuseDashDemoAccountProfile({
      version: 1,
      account: { id: MUSEDASH_TEST_ACCOUNT_ID, displayName: ' ' },
    })).toBeNull();
  });
});
