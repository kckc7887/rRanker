import { DEFAULT_TAG_PRESETS, type UserDataBackupV1 } from '@/domain/user-library';
import type { UserLibraryRepository } from '@/repositories/user-library-repository';
import { UserLibraryService } from '@/services/user-library-service';

function repository(initialPresets: string[]): UserLibraryRepository & { presets: string[] } {
  const state = {
    presets: [...initialPresets],
    list: async () => [],
    listTagPresets: async () => [...state.presets],
    setTagPresets: async (values: readonly string[]) => (state.presets = [...values]),
    update: async () => [],
    restore: async () => [],
    clear: async () => undefined,
  };
  return state;
}

const v1: UserDataBackupV1 = {
  format: 'rranker-user-data', version: 1, exportedAt: '2026-07-19T00:00:00.000Z', items: [],
};

describe('v1 user-data backup compatibility', () => {
  it('preserves existing presets when merging a v1 backup', async () => {
    const repo = repository(['自定义']);
    await new UserLibraryService(repo).restore(v1, 'merge');
    expect(repo.presets).toEqual(['自定义']);
  });

  it('restores default presets when replacing from a v1 backup', async () => {
    const repo = repository(['自定义']);
    await new UserLibraryService(repo).restore(v1, 'replace');
    expect(repo.presets).toEqual(DEFAULT_TAG_PRESETS);
  });
});
