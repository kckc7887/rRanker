import type { GameId } from '@/domain/game-bind-options';
import type { LibraryTarget, RestoreMode, UserLibraryItem } from '@/domain/user-library';

export interface UserLibraryRepository {
  list(gameId?: GameId): Promise<UserLibraryItem[]>;
  listTagPresets?(): Promise<string[]>;
  setTagPresets?(values: readonly string[]): Promise<string[]>;
  update(transform: (items: UserLibraryItem[]) => UserLibraryItem[]): Promise<UserLibraryItem[]>;
  restore(items: UserLibraryItem[], mode: RestoreMode): Promise<UserLibraryItem[]>;
  /** 在同一次事务里替换条目和标签预设。校验必须在调用前完成。 */
  replaceContents?(items: UserLibraryItem[], presets: readonly string[]): Promise<UserLibraryItem[]>;
  /**
   * 在同一串行事务内读取当前条目与预设、合并导入内容、复核条目上限并提交。
   * imported 必须已通过备份结构校验；合并与替换共用这一原语。
   */
  mergeBackup(
    imported: { items: readonly UserLibraryItem[]; presets: readonly string[] },
    mode: RestoreMode,
  ): Promise<UserLibraryItem[]>;
  /**
   * 按键读取单个条目并在同一事务内写回，不触碰其它行；返回全量条目。
   * update 结果不再保留时删除该行；失去引用的标签随同清理。
   */
  updateTarget(
    target: LibraryTarget,
    update: (current: UserLibraryItem | undefined) => UserLibraryItem,
  ): Promise<UserLibraryItem[]>;
  /** 按游戏删除条目与关联，保留其它游戏与标签预设；返回剩余全量条目。 */
  clearGame(gameId: GameId): Promise<UserLibraryItem[]>;
  clear(): Promise<void>;
}
