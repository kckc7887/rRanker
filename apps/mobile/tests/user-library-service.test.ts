import type { RestoreMode, UserLibraryItem } from '@/domain/user-library';
import type { UserLibraryRepository } from '@/repositories/user-library-repository';
import { UserLibraryService } from '@/services/user-library-service';

class MemoryRepository implements UserLibraryRepository {
  items: UserLibraryItem[] = [];
  async list() { return this.items; }
  async update(transform: (items: UserLibraryItem[]) => UserLibraryItem[]) { this.items = transform(this.items); return this.items; }
  async restore(items: UserLibraryItem[], mode: RestoreMode) { this.items = mode === 'replace' ? items : [...this.items, ...items]; return this.items; }
  async clear() { this.items = []; }
}

describe('UserLibraryService', () => {
  const now = '2026-07-13T02:00:00.000Z';

  it('removes orphaned entries after flags and tags are both cleared', async () => {
    const repository = new MemoryRepository();
    const service = new UserLibraryService(repository, () => now);
    await service.setSongFavorite('10001', true);
    await service.setTags({ kind: 'song', songId: '10001' }, ['喜欢']);
    await service.setSongFavorite('10001', false);
    expect(repository.items).toHaveLength(1);
    await service.setTags({ kind: 'song', songId: '10001' }, []);
    expect(repository.items).toEqual([]);
  });

  it('keeps song favorite and chart practice as separate targets', async () => {
    const repository = new MemoryRepository();
    const service = new UserLibraryService(repository, () => now);
    await service.setSongFavorite('1', true);
    await service.setChartPractice('1', 'DX', 3, true);
    expect(repository.items.map((item) => item.key).sort()).toEqual(['chart:1:DX:3', 'song:1']);
  });
});
