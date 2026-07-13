import type { RestoreMode, UserLibraryItem } from '@/domain/user-library';

export interface UserLibraryRepository {
  list(): Promise<UserLibraryItem[]>;
  update(transform: (items: UserLibraryItem[]) => UserLibraryItem[]): Promise<UserLibraryItem[]>;
  restore(items: UserLibraryItem[], mode: RestoreMode): Promise<UserLibraryItem[]>;
  clear(): Promise<void>;
}
