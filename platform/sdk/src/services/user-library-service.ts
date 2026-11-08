import { getGameAdapter, isGameAvailable, subscribePlugins } from '@rranker/sdk';
import { createUserDataBackup, libraryTargetKey, normalizeTagPresets, normalizeTags, parseUserDataBackup } from '@rranker/sdk/domain/user-library';
import type { LibraryTarget, SongLibraryTarget, ChartLibraryTarget, RestoreMode, UserDataBackup, UserLibraryItem } from '@rranker/sdk/domain/user-library';
import { SqliteUserLibraryRepository } from '@rranker/sdk/storage/sqlite-user-library-repository';

export class UserLibraryService {
  private readonly repository = new SqliteUserLibraryRepository();

  list(gameId?: string): Promise<UserLibraryItem[]> { return this.repository.list(gameId); }
  listTagPresets(gameId: string): Promise<string[]> { return this.repository.listTagPresets(gameId); }
  setTagPresets(gameId: string, values: readonly string[]): Promise<string[]> {
    return this.repository.setTagPresets(gameId, normalizeTagPresets(values));
  }

  setSongFavorite(target: SongLibraryTarget, favorite: boolean): Promise<UserLibraryItem[]> {
    return this.updateTarget(target, (current, timestamp) => ({
      ...target, key: libraryTargetKey(target), favorite, tags: current?.tags ?? [],
      createdAt: current?.createdAt ?? timestamp, updatedAt: timestamp,
    }));
  }

  setChartPractice(target: ChartLibraryTarget, practice: boolean): Promise<UserLibraryItem[]> {
    return this.updateTarget(target, (current, timestamp) => ({
      ...target, key: libraryTargetKey(target), practice, tags: current?.tags ?? [],
      createdAt: current?.createdAt ?? timestamp, updatedAt: timestamp,
    }));
  }

  setTags(target: LibraryTarget, values: readonly string[]): Promise<UserLibraryItem[]> {
    const tags = normalizeTags(values);
    return this.updateTarget(target, (current, timestamp) => ({
      ...target, key: libraryTargetKey(target), tags,
      createdAt: current?.createdAt ?? timestamp, updatedAt: timestamp,
      ...(target.kind === 'song'
        ? { kind: 'song', favorite: current?.kind === 'song' ? current.favorite : false }
        : { kind: 'chart', practice: current?.kind === 'chart' ? current.practice : false }),
    }));
  }

  async createBackup(gameId: string): Promise<UserDataBackup> {
    const { items, tagPresets } = await this.repository.readBackup(gameId);
    return createUserDataBackup(gameId, items, new Date().toISOString(), tagPresets);
  }

  restore(gameId: string, backup: UserDataBackup, mode: RestoreMode, signal?: AbortSignal): Promise<UserLibraryItem[]> {
    const parsed = parseUserDataBackup(backup, gameId);
    const adapter = getGameAdapter(gameId);
    if (!adapter || !isGameAvailable(gameId)) throw new Error('当前游戏适配器不可用');
    const items = parsed.items.map(item => {
      const target = adapter.parseLibraryTarget(item);
      if (item.kind === 'song' && target?.kind === 'song') return { ...item, ...target };
      if (item.kind === 'chart' && target?.kind === 'chart') return { ...item, ...target };
      throw new Error('备份包含无效的曲目或谱面');
    });
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) abort();
    signal?.addEventListener('abort', abort, { once: true });
    const unsubscribe = subscribePlugins(() => { if (!isGameAvailable(gameId)) abort(); });
    return this.repository.mergeBackup(gameId, { items, presets: parsed.tagPresets }, mode, controller.signal)
      .finally(() => { unsubscribe(); signal?.removeEventListener('abort', abort); });
  }

  clearGame(gameId: string): Promise<UserLibraryItem[]> { return this.repository.clearGame(gameId); }

  private updateTarget(target: LibraryTarget, create: (current: UserLibraryItem | undefined, timestamp: string) => UserLibraryItem): Promise<UserLibraryItem[]> {
    const timestamp = new Date().toISOString();
    return this.repository.updateTarget(target, current => create(current, timestamp));
  }
}
