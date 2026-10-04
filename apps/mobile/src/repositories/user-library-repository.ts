import type { GameId } from '@/domain/game-bind-options';
import type { LibraryTarget, RestoreMode, UserLibraryItem } from '@/domain/user-library';

export interface UserLibraryRepository {
  list(gameId?: GameId): Promise<UserLibraryItem[]>;
  listTagPresets(): Promise<string[]>;
  setTagPresets(values: readonly string[]): Promise<string[]>;
  mergeBackup(
    imported: { items: readonly UserLibraryItem[]; presets: readonly string[] },
    mode: RestoreMode,
  ): Promise<UserLibraryItem[]>;
  updateTarget(
    target: LibraryTarget,
    update: (current: UserLibraryItem | undefined) => UserLibraryItem,
  ): Promise<UserLibraryItem[]>;
  clearGame(gameId: GameId): Promise<UserLibraryItem[]>;
  clear(): Promise<void>;
}
