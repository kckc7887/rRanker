import { describe, expect, it } from 'vitest';
import {
  DEMO_ACCOUNT_ID,
  addDemoAccount,
  deleteDemoAccount,
  initializeDesktopState,
  type DatabaseLike,
} from '../src/data/database';

class FakeDatabase implements DatabaseLike {
  meta = new Map<string, string>();
  accounts = new Map<string, {
    id: string;
    game_id: string;
    provider_id: string;
    display_name: string;
    created_at: string;
  }>();

  async select<T>(query: string, values: unknown[] = []): Promise<T> {
    if (query.includes('FROM app_meta')) {
      const value = this.meta.get(String(values[0]));
      return (value ? [{ value }] : []) as T;
    }
    if (query.includes('FROM accounts')) {
      return [...this.accounts.values()] as T;
    }
    return [] as T;
  }

  async execute(query: string, values: unknown[] = []): Promise<unknown> {
    if (query.includes('INSERT INTO app_meta')) {
      this.meta.set(String(values[0]), String(values[1]));
    } else if (
      query.includes('INSERT OR IGNORE INTO accounts') ||
      query.includes('INSERT INTO accounts')
    ) {
      const id = String(values[0]);
      if (!this.accounts.has(id) || query.includes('ON CONFLICT')) {
        this.accounts.set(id, {
          id,
          game_id: 'maimai',
          provider_id: 'maimai-test',
          display_name: '示例账号',
          created_at: String(values[1]),
        });
      }
    } else if (query.includes('DELETE FROM accounts')) {
      this.accounts.delete(String(values[0]));
    }
    return { rowsAffected: 1 };
  }
}

describe('桌面账号初始化', () => {
  it('只在第一次启动时自动创建示例账号', async () => {
    const database = new FakeDatabase();
    const first = await initializeDesktopState(database);
    expect(first.activeAccount?.id).toBe(DEMO_ACCOUNT_ID);

    await deleteDemoAccount(database);
    const second = await initializeDesktopState(database);
    expect(second.accounts).toEqual([]);
    expect(second.activeAccount).toBeNull();
  });

  it('用户可在删除后手动重新添加示例账号', async () => {
    const database = new FakeDatabase();
    await initializeDesktopState(database);
    await deleteDemoAccount(database);
    const restored = await addDemoAccount(database);
    expect(restored.id).toBe(DEMO_ACCOUNT_ID);
    const state = await initializeDesktopState(database);
    expect(state.activeAccount?.displayName).toBe('示例账号');
  });
});
