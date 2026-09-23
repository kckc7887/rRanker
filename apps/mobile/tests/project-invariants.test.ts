import { describe, expect, it } from 'vitest';
import {
  assertUserDataBackupExportable,
  createUserDataBackup,
  MAX_BACKUP_FILE_BYTES,
  parseUserDataBackup,
} from '@/domain/user-library';
import {
  assertChartPreviewDownloadBytes,
  CHART_PREVIEW_MAX_DOWNLOAD_BYTES,
  ChartPreviewBudgetError,
} from '@/features/chart-preview-shared/chart-preview-resource-budget';
import { gameDataQueryKey } from '@/services/game-data-query';
import { captureResourceWrites, invalidateResourceWrites } from '@/services/snapshot-cache-utils';
import {
  accountDirectoryCorruptKey,
  loadAccountDirectory,
} from '@/storage/create-demo-account-store';

class MemoryStore {
  values = new Map<string, string>();
  async getItem(key: string) { return this.values.get(key) ?? null; }
  async setItem(key: string, value: string) { this.values.set(key, value); }
  async removeItem(key: string) { this.values.delete(key); }
}

describe('project invariants', () => {
  it('keeps the original account directory when the JSON cannot be parsed', async () => {
    const storage = new MemoryStore();
    storage.values.set('accounts', '{');
    await expect(loadAccountDirectory(storage, 'accounts', (value) => value, [])).rejects.toThrow('账号目录内容损坏');
    expect(storage.values.get('accounts')).toBe('{');
    expect(storage.values.get(accountDirectoryCorruptKey('accounts'))).toBe('{');
  });

  it('rejects a write captured before its account generation moved on', () => {
    const assertCurrent = captureResourceWrites('invariant-scope', undefined, 'account-a');
    assertCurrent();
    invalidateResourceWrites('account:account-a');
    expect(() => assertCurrent()).toThrow('缓存请求已失效');
  });

  it('puts the account id in the game data query key', () => {
    const first = gameDataQueryKey('account-a', 'maimai', 'local', null);
    const second = gameDataQueryKey('account-b', 'maimai', 'local', null);
    expect(first).toContain('account-a');
    expect(first).not.toEqual(second);
  });

  it('round-trips a user data backup inside the export limit', () => {
    const backup = createUserDataBackup([{
      kind: 'song',
      gameId: 'maimai',
      songId: '1',
      key: 'song:maimai:1',
      favorite: true,
      tags: ['收藏'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }]);
    expect(parseUserDataBackup(JSON.parse(JSON.stringify(backup)))).toEqual(backup);
    expect(() => assertUserDataBackupExportable(backup)).not.toThrow();
    expect(MAX_BACKUP_FILE_BYTES).toBe(12 * 1024 * 1024);
  });

  it('rejects a chart preview download above the shared byte budget', () => {
    expect(() => assertChartPreviewDownloadBytes(CHART_PREVIEW_MAX_DOWNLOAD_BYTES + 1))
      .toThrow(ChartPreviewBudgetError);
  });
});
