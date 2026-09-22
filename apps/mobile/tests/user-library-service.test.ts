import { createUserDataBackup, MAX_BACKUP_FILE_BYTES, userDataBackupBytes, type RestoreMode, type UserDataBackup, type UserLibraryItem } from '@/domain/user-library';
import type { GameId } from '@/domain/game-bind-options';
import type { UserLibraryRepository } from '@/repositories/user-library-repository';
import { UserLibraryService } from '@/services/user-library-service';

class MemoryRepository implements UserLibraryRepository {
  items: UserLibraryItem[] = [];
  presets: string[] = [];
  failReplace = false;
  async list(gameId?: GameId) {
    return gameId ? this.items.filter((item) => item.gameId === gameId) : this.items;
  }
  async listTagPresets() { return [...this.presets]; }
  async update(transform: (items: UserLibraryItem[]) => UserLibraryItem[]) { this.items = transform(this.items); return this.items; }
  async restore(items: UserLibraryItem[], mode: RestoreMode) { this.items = mode === 'replace' ? items : [...this.items, ...items]; return this.items; }
  async replaceContents(items: UserLibraryItem[], presets: readonly string[]) {
    if (this.failReplace) throw new Error('预设写入失败');
    this.items = items;
    this.presets = [...presets];
    return this.items;
  }
  async clear() { this.items = []; }
}

describe('UserLibraryService', () => {
  const now = '2026-07-13T02:00:00.000Z';

  it('removes orphaned entries after flags and tags are both cleared', async () => {
    const repository = new MemoryRepository();
    const service = new UserLibraryService(repository, () => now);
    await service.setSongFavorite('maimai', '10001', true);
    await service.setTags({ kind: 'song', gameId: 'maimai', songId: '10001' }, ['喜欢']);
    await service.setSongFavorite('maimai', '10001', false);
    expect(repository.items).toHaveLength(1);
    await service.setTags({ kind: 'song', gameId: 'maimai', songId: '10001' }, []);
    expect(repository.items).toEqual([]);
  });

  it('keeps song favorite and chart practice as separate targets', async () => {
    const repository = new MemoryRepository();
    const service = new UserLibraryService(repository, () => now);
    await service.setSongFavorite('maimai', '1', true);
    await service.setChartPractice('maimai', '1', 'DX', 3, true);
    expect(repository.items.map((item) => item.key).sort()).toEqual(['chart:maimai:1:DX:3', 'song:maimai:1']);
  });

  it('isolates the same song id across games', async () => {
    const repository = new MemoryRepository();
    const service = new UserLibraryService(repository, () => now);
    await service.setSongFavorite('maimai', 'Song.A', true);
    await service.setSongFavorite('phigros', 'Song.A', false);
    await service.setTags({ kind: 'song', gameId: 'phigros', songId: 'Song.A' }, ['喜欢']);
    expect(repository.items.map((item) => item.key).sort()).toEqual(['song:maimai:Song.A', 'song:phigros:Song.A']);
  });

  it('clears only the requested game data', async () => {
    const repository = new MemoryRepository();
    const service = new UserLibraryService(repository, () => now);
    await service.setSongFavorite('maimai', 'Song.A', true);
    await service.setSongFavorite('phigros', 'Song.A', true);
    await service.setChartPractice('phigros', 'Song.A', 'SD', 2, true);
    await service.clearGame('phigros');
    expect(repository.items.map((item) => item.key)).toEqual(['song:maimai:Song.A']);
  });

  it('rejects a preset merge before replacing stored items', async () => {
    const repository = new MemoryRepository();
    const service = new UserLibraryService(repository, () => now);
    const kept: UserLibraryItem = {
      key: 'song:maimai:1', gameId: 'maimai', kind: 'song', songId: '1', favorite: true, tags: [],
      createdAt: now, updatedAt: now,
    };
    repository.items = [kept];
    repository.presets = Array.from({ length: 20 }, (_, index) => `现有${index}`);
    const backup: UserDataBackup = {
      format: 'rranker-user-data',
      version: 3,
      exportedAt: now,
      items: [],
      tagPresets: Array.from({ length: 20 }, (_, index) => `备份${index}`),
    };
    await expect(service.restore(backup, 'merge')).rejects.toThrow('标签预设');
    expect(repository.items).toEqual([kept]);
    expect(repository.presets).toHaveLength(20);
  });

  it('keeps a 4000-item backup inside the shared import limit', () => {
    const items = Array.from({ length: 4000 }, (_, index): UserLibraryItem => ({
      key: `song:maimai:${index}`, gameId: 'maimai', kind: 'song', songId: String(index).padStart(8, '0'), favorite: true, tags: ['收藏'],
      createdAt: now, updatedAt: now,
    }));
    const backup = createUserDataBackup(items, now);
    const bytes = userDataBackupBytes(backup);
    expect(bytes).toBeGreaterThan(1024 * 1024);
    expect(bytes).toBeLessThanOrEqual(MAX_BACKUP_FILE_BYTES);
  });
});
