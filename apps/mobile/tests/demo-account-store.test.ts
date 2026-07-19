import { describe, expect, it } from 'vitest';
import {
  DemoAccountStore,
  parseDemoAccountProfiles,
} from '@/storage/demo-account-store';

describe('DemoAccountStore', () => {
  it('upserts and removes demo profiles', async () => {
    const memory = new Map<string, string>();
    const store = new DemoAccountStore({
      getItem: async (key) => memory.get(key) ?? null,
      setItem: async (key, value) => { memory.set(key, value); },
      removeItem: async (key) => { memory.delete(key); },
    });

    await store.upsert({ id: 'maimai:test', displayName: '示例账号' });
    expect(await store.load()).toEqual([{ id: 'maimai:test', displayName: '示例账号' }]);

    await store.remove('maimai:test');
    expect(await store.load()).toEqual([]);
  });

  it('filters invalid demo profiles', () => {
    expect(parseDemoAccountProfiles({
      version: 1,
      accounts: [
        { id: 'maimai:test', displayName: ' 示例 ' },
        { id: 'maimai:local', displayName: '本地' },
        { id: 'maimai:test', displayName: '重复' },
      ],
    })).toEqual([{ id: 'maimai:test', displayName: '示例' }]);
  });
});
