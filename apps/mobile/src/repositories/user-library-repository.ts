import type { GameId } from '@/domain/game-bind-options';
import type { RestoreMode, UserLibraryItem } from '@/domain/user-library';

export interface UserLibraryRepository {
  list(gameId?: GameId): Promise<UserLibraryItem[]>;
  listTagPresets?(): Promise<string[]>;
  setTagPresets?(values: readonly string[]): Promise<string[]>;
  update(transform: (items: UserLibraryItem[]) => UserLibraryItem[]): Promise<UserLibraryItem[]>;
  restore(items: UserLibraryItem[], mode: RestoreMode): Promise<UserLibraryItem[]>;
  clear(): Promise<void>;
}
