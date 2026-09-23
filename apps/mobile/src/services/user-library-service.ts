import { assertUserDataBackupExportable, createUserDataBackup, DEFAULT_TAG_PRESETS, libraryTargetKey, MAX_BACKUP_ITEMS, mergeLibraryItems, normalizeLibraryItem, normalizeTagPresets, normalizeTags, shouldKeepLibraryItem } from '@/domain/user-library';
import type { LibraryTarget, RestoreMode, UserDataBackup, UserDataBackupV3, UserLibraryItem } from '@/domain/user-library';
import type { GameId } from '@/domain/game-bind-options';
import type { ChartType } from '@/domain/models';
import type { UserLibraryRepository } from '@/repositories/user-library-repository';

export class UserLibraryService {
  constructor(private readonly repository: UserLibraryRepository, private readonly now = () => new Date().toISOString()) {}

  list(gameId?: GameId): Promise<UserLibraryItem[]> { return this.repository.list(gameId); }
  listTagPresets(): Promise<string[]> {
    return this.repository.listTagPresets?.() ?? Promise.resolve([...DEFAULT_TAG_PRESETS]);
  }
  setTagPresets(values: readonly string[]): Promise<string[]> {
    const normalized = normalizeTagPresets(values);
    return this.repository.setTagPresets?.(normalized) ?? Promise.resolve(normalized);
  }

  setSongFavorite(gameId: GameId, songId: string, favorite: boolean): Promise<UserLibraryItem[]> {
    return this.updateTarget({ kind: 'song', gameId, songId }, (current, timestamp) => ({
      key: current?.key ?? libraryTargetKey({ kind: 'song', gameId, songId }),
      gameId, kind: 'song', songId,
      favorite, tags: current?.tags ?? [], createdAt: current?.createdAt ?? timestamp, updatedAt: timestamp,
    }));
  }

  setChartPractice(gameId: GameId, songId: string, type: ChartType, levelIndex: number, practice: boolean): Promise<UserLibraryItem[]> {
    const target: LibraryTarget = { kind: 'chart', gameId, songId, type, levelIndex };
    return this.updateTarget(target, (current, timestamp) => ({
      key: current?.key ?? libraryTargetKey(target), gameId, kind: 'chart', songId, type, levelIndex,
      practice, tags: current?.tags ?? [], createdAt: current?.createdAt ?? timestamp, updatedAt: timestamp,
    }));
  }

  setTags(target: LibraryTarget, values: readonly string[]): Promise<UserLibraryItem[]> {
    const tags = normalizeTags(values);
    return this.updateTarget(target, (current, timestamp) => target.kind === 'song'
      ? { key: current?.key ?? libraryTargetKey(target), gameId: target.gameId, kind: 'song', songId: target.songId,
        favorite: current?.kind === 'song' ? current.favorite : false, tags,
        createdAt: current?.createdAt ?? timestamp, updatedAt: timestamp }
      : { key: current?.key ?? libraryTargetKey(target), gameId: target.gameId, kind: 'chart', songId: target.songId,
        type: target.type, levelIndex: target.levelIndex, practice: current?.kind === 'chart' ? current.practice : false,
        tags, createdAt: current?.createdAt ?? timestamp, updatedAt: timestamp });
  }

  async createBackup(): Promise<UserDataBackupV3> {
    const [items, tagPresets] = await Promise.all([this.repository.list(), this.listTagPresets()]);
    const backup = createUserDataBackup(items, this.now(), tagPresets);
    assertUserDataBackupExportable(backup);
    return backup;
  }

  async restore(backup: UserDataBackup, mode: RestoreMode): Promise<UserLibraryItem[]> {
    const [currentItems, currentPresets] = await Promise.all([this.repository.list(), this.listTagPresets()]);
    const importedPresets = backup.version === 1 ? [...DEFAULT_TAG_PRESETS] : backup.tagPresets;
    const nextPresets = backup.version === 1 && mode === 'merge'
      ? currentPresets
      : normalizeTagPresets(mode === 'merge' ? [...currentPresets, ...importedPresets] : importedPresets);
    const imported = backup.items.map((item) => normalizeLibraryItem(item)).filter(shouldKeepLibraryItem);
    const nextItems = mode === 'merge' ? mergeLibraryItems(currentItems, imported) : mergeLibraryItems([], imported);
    if (nextItems.length > MAX_BACKUP_ITEMS) throw new Error('备份条目超过上限');
    if (!this.repository.replaceContents) throw new Error('个人曲库恢复缺少原子写入');
    return this.repository.replaceContents(nextItems, nextPresets);
  }

  clear(): Promise<void> { return this.repository.clear(); }

  /** 仅清除指定游戏的收藏、练习谱面和条目标签；保留其他游戏及全局标签预设。 */
  clearGame(gameId: GameId): Promise<UserLibraryItem[]> {
    return this.repository.update((items) => items.filter((item) => item.gameId !== gameId));
  }

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
