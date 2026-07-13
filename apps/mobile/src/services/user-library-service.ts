import { createUserDataBackup, libraryTargetKey, normalizeTags, shouldKeepLibraryItem } from '@/domain/user-library';
import type { LibraryTarget, RestoreMode, UserDataBackupV1, UserLibraryItem } from '@/domain/user-library';
import type { UserLibraryRepository } from '@/repositories/user-library-repository';

export class UserLibraryService {
  constructor(private readonly repository: UserLibraryRepository, private readonly now = () => new Date().toISOString()) {}

  list(): Promise<UserLibraryItem[]> { return this.repository.list(); }

  setSongFavorite(songId: string, favorite: boolean): Promise<UserLibraryItem[]> {
    return this.updateTarget({ kind: 'song', songId }, (current, timestamp) => ({
      key: current?.key ?? libraryTargetKey({ kind: 'song', songId }), kind: 'song', songId,
      favorite, tags: current?.tags ?? [], createdAt: current?.createdAt ?? timestamp, updatedAt: timestamp,
    }));
  }

  setChartPractice(songId: string, type: 'SD' | 'DX', levelIndex: number, practice: boolean): Promise<UserLibraryItem[]> {
    const target: LibraryTarget = { kind: 'chart', songId, type, levelIndex };
    return this.updateTarget(target, (current, timestamp) => ({
      key: current?.key ?? libraryTargetKey(target), kind: 'chart', songId, type, levelIndex,
      practice, tags: current?.tags ?? [], createdAt: current?.createdAt ?? timestamp, updatedAt: timestamp,
    }));
  }

  setTags(target: LibraryTarget, values: readonly string[]): Promise<UserLibraryItem[]> {
    const tags = normalizeTags(values);
    return this.updateTarget(target, (current, timestamp) => target.kind === 'song'
      ? { key: current?.key ?? libraryTargetKey(target), kind: 'song', songId: target.songId,
        favorite: current?.kind === 'song' ? current.favorite : false, tags,
        createdAt: current?.createdAt ?? timestamp, updatedAt: timestamp }
      : { key: current?.key ?? libraryTargetKey(target), kind: 'chart', songId: target.songId,
        type: target.type, levelIndex: target.levelIndex, practice: current?.kind === 'chart' ? current.practice : false,
        tags, createdAt: current?.createdAt ?? timestamp, updatedAt: timestamp });
  }

  async createBackup(): Promise<UserDataBackupV1> {
    return createUserDataBackup(await this.repository.list(), this.now());
  }

  restore(backup: UserDataBackupV1, mode: RestoreMode): Promise<UserLibraryItem[]> {
    return this.repository.restore(backup.items, mode);
  }

  clear(): Promise<void> { return this.repository.clear(); }

  private updateTarget(
    target: LibraryTarget,
    create: (current: UserLibraryItem | undefined, timestamp: string) => UserLibraryItem,
  ): Promise<UserLibraryItem[]> {
    const key = libraryTargetKey(target);
    return this.repository.update((items) => {
      const current = items.find((item) => item.key === key);
      const next = create(current, this.now());
      return [...items.filter((item) => item.key !== key), next].filter(shouldKeepLibraryItem);
    });
  }
}
