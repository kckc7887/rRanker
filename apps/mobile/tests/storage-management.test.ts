import { describe, expect, it, vi } from 'vitest';
import {
  parseStorageClearPreferences,
  type StorageClearCategoryId,
} from '@/storage/storage-clear-prefs-store';
import { formatStorageBytes } from '@/features/storage-management/format-storage-bytes';
import { isDurableMaimaiAccountId } from '@/features/storage-management/durable-maimai-account';
import { clearStorageByCategories } from '@/features/storage-management/clear-storage-cache';
import {
  isAppOwnedCacheEntry,
  isExpoSystemCacheEntry,
} from '@/features/storage-management/expo-system-cache';
import {
  getGameStorageAdapter,
  sharedCacheNote,
} from '@/features/storage-management/game-storage-adapters';
import {
  listClearableCategoryIds,
} from '@/features/storage-management/storage-usage';

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn(async () => ({
    execAsync: vi.fn(async () => undefined),
    getFirstAsync: vi.fn(async () => null),
    getAllAsync: vi.fn(async () => []),
    runAsync: vi.fn(async () => undefined),
  })),
}));

vi.mock('@/domain/game-bind-options', () => {
  const titles: Record<string, string> = {
    maimai: '舞萌 DX',
    chunithm: '中二节奏',
    phigros: 'Phigros',
    adofai: '冰与火之舞',
    musedash: '喵斯快跑',
    phira: 'Phira',
    test: '测试游戏',
  };
  return {
    findGame: (id: string) => ({ id, title: titles[id] ?? '未知游戏' }),
  };
});

vi.mock('@/features/storage-management/fs-storage', () => ({
  measureDirectoryBytes: () => 0,
  clearAppOwnedCacheContents: () => undefined,
  APP_CACHE_ROOT: () => null,
  PHIGROS_FONT_ROOT: () => null,
}));

vi.mock('@/features/storage-management/ui-icon-fonts', () => ({
  reloadUiIconFonts: async () => undefined,
}));

vi.mock('@/features/phigros-best-image/load-phigros-image-assets', () => ({
  clearPhigrosIllustrationStage: () => undefined,
  phigrosIllustrationStageDirectory: () => null,
}));

vi.mock('@/features/phigros-best-image/phigros-font-cache', () => ({
  clearPhigrosFontCache: () => undefined,
}));

describe('storage-clear-prefs', () => {
  const allowed: StorageClearCategoryId[] = ['maimai', 'chunithm', 'phigros', 'shared'];

  it('defaults to all allowed ids when empty', () => {
    expect(parseStorageClearPreferences(null, allowed)).toEqual({
      version: 1,
      selectedIds: ['maimai', 'chunithm', 'phigros', 'shared'],
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

describe('durable maimai local accounts', () => {
  it('treats local account ids as durable user data', () => {
    expect(isDurableMaimaiAccountId('maimai:local')).toBe(true);
    expect(isDurableMaimaiAccountId('maimai:local:abc')).toBe(true);
    expect(isDurableMaimaiAccountId('maimai:diving-fish:u1')).toBe(false);
    expect(isDurableMaimaiAccountId('maimai:test')).toBe(false);
  });
});

describe('expo system cache entries', () => {
  it('recognizes ExponentAsset files used by icon fonts', () => {
    expect(isExpoSystemCacheEntry('ExponentAsset-123.ttf')).toBe(true);
    expect(isExpoSystemCacheEntry('ExponentAsset-abc.png')).toBe(true);
    expect(isExpoSystemCacheEntry('rranker-best-image-1-0.html')).toBe(false);
    expect(isExpoSystemCacheEntry('rRanker-backup-x.json')).toBe(false);
  });
});

describe('app-owned cache entries', () => {
  it('only treats rranker temp files as clearable shared cache', () => {
    expect(isAppOwnedCacheEntry('rranker-best-image-1-0.html')).toBe(true);
    expect(isAppOwnedCacheEntry('rRanker-backup-x.json')).toBe(true);
    expect(isAppOwnedCacheEntry('ExponentAsset-123.ttf')).toBe(false);
    expect(isAppOwnedCacheEntry('Image')).toBe(false);
  });
});

describe('adofai storage segment', () => {
  it('is registered in the clearable category list', () => {
    expect(listClearableCategoryIds()).toContain('adofai');
  });

  it('exposes a measure/clear adapter', () => {
    const adapter = getGameStorageAdapter('adofai');
    expect(adapter).toBeDefined();
    expect(adapter?.title).toBe('冰与火之舞');
  });
});

describe('musedash storage segment', () => {
  it('is registered in the clearable category list', () => {
    expect(listClearableCategoryIds()).toContain('musedash');
  });

  it('exposes a measure/clear adapter', () => {
    const adapter = getGameStorageAdapter('musedash');
    expect(adapter).toBeDefined();
    expect(adapter?.title).toBe('喵斯快跑');
  });
});

describe('phira storage segment', () => {
  it('is registered in the clearable category list', () => {
    expect(listClearableCategoryIds()).toContain('phira');
  });

  it('measures and clears every Phira resource through the common adapter', async () => {
    const clearAccountScores = vi.fn(async () => undefined);
    const clearResources = vi.fn(async () => undefined);
    const snapshots = {
      listAccountScoreSizes: vi.fn(async () => []),
      listResourceSizes: vi.fn(async () => [
        { key: 'phira:player:323528', bytes: 10 },
        { key: 'phira:bests:323528', bytes: 20 },
        { key: 'phira:charts:ranked:0:', bytes: 30 },
        { key: 'phira:chart:38294', bytes: 40 },
        { key: 'phira:notes:38294', bytes: 50 },
        { key: 'musedash:catalog', bytes: 999 },
      ]),
      clearAccountScores,
      clearResources,
    };
    const adapter = getGameStorageAdapter('phira');
    expect(adapter?.title).toBe('Phira');
    await expect(adapter?.measure(snapshots as never)).resolves.toBe(150);
    await adapter?.clear(snapshots as never);
    expect(clearAccountScores).toHaveBeenCalledWith([]);
    expect(clearResources).toHaveBeenCalledWith([
      'phira:player:323528',
      'phira:bests:323528',
      'phira:charts:ranked:0:',
      'phira:chart:38294',
      'phira:notes:38294',
    ]);
  });

  it('removes Phira in-memory queries after clearing persistent cache', async () => {
    const client = {
      invalidateQueries: vi.fn(async () => undefined),
      removeQueries: vi.fn(),
    };
    await expect(clearStorageByCategories(['phira'], client as never)).resolves.toEqual({
      clearedIds: ['phira'],
      failures: [],
    });
    expect(client.removeQueries).toHaveBeenCalledWith({ queryKey: ['phira'] });
  });
});

describe('shared cache note wording', () => {
  it('uses the unified include/exclude wording', () => {
    expect(sharedCacheNote()).toBe('临时文件与图片缓存；不含系统图标字体');
  });
});
