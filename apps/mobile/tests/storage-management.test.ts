import { describe, expect, it } from 'vitest';
import {
  parseStorageClearPreferences,
  type StorageClearCategoryId,
} from '@/storage/storage-clear-prefs-store';
import { formatStorageBytes } from '@/features/storage-management/format-storage-bytes';

describe('storage-clear-prefs', () => {
  const allowed: StorageClearCategoryId[] = ['maimai', 'phigros', 'shared'];

  it('defaults to all allowed ids when empty', () => {
    expect(parseStorageClearPreferences(null, allowed)).toEqual({
      version: 1,
      selectedIds: ['maimai', 'phigros', 'shared'],
    });
  });

  it('keeps only allowed selected ids', () => {
    expect(parseStorageClearPreferences({
      version: 1,
      selectedIds: ['maimai', 'shared', 'unknown', 'test'],
    }, allowed)).toEqual({
      version: 1,
      selectedIds: ['maimai', 'shared'],
    });
  });

  it('falls back when selectedIds missing', () => {
    expect(parseStorageClearPreferences({ version: 1 }, allowed).selectedIds).toEqual(allowed);
  });
});

describe('formatStorageBytes', () => {
  it('formats bytes', () => {
    expect(formatStorageBytes(0)).toBe('0 B');
    expect(formatStorageBytes(800)).toBe('800 B');
    expect(formatStorageBytes(2048)).toBe('2.0 KB');
    expect(formatStorageBytes(2.5 * 1024 * 1024)).toBe('2.5 MB');
  });
});
