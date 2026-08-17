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

const mocks = vi.hoisted(() => ({
  execAsync: vi.fn(async () => undefined),
  measureDirectoryBytes: vi.fn(() => 0),
  clearMaimaiUiCache: vi.fn(),
  resetPhigrosKyouAliasesCache: vi.fn(),
}));

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn(async () => ({
    execAsync: mocks.execAsync,
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
    'osu-standard': 'osu!standard',
    'osu-mania': 'osu!mania',
    'osu-catch': 'osu!catch',
    'osu-taiko': 'osu!taiko',
  };
  return {
    findGame: (id: string) => ({ id, title: titles[id] ?? '未知游戏' }),
  };
});

vi.mock('@/features/storage-management/fs-storage', () => ({
  measureDirectoryBytes: mocks.measureDirectoryBytes,
  clearAppOwnedCacheContents: () => undefined,
  APP_CACHE_ROOT: () => null,
  PHIGROS_FONT_ROOT: () => null,
  MAIMAI_ASSETS_ROOT: () => null,
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

vi.mock('@/features/best-image/maimai-ui-cache', () => ({
  clearMaimaiUiCache: mocks.clearMaimaiUiCache,
}));

vi.mock('@/hooks/use-phigros-kyou', () => ({
  resetPhigrosKyouAliasesCache: mocks.resetPhigrosKyouAliasesCache,
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

describe('osu storage segment', () => {
  it('registers all four modes in the clearable category list', () => {
    for (const gameId of ['osu-standard', 'osu-mania', 'osu-catch', 'osu-taiko']) {
      expect(listClearableCategoryIds()).toContain(gameId);
    }
  });

  it('exposes a measure/clear adapter with the mode title', () => {
    expect(getGameStorageAdapter('osu-standard')?.title).toBe('osu!standard');
    expect(getGameStorageAdapter('osu-catch')?.title).toBe('osu!catch');
  });

  it('measures and clears only the matching mode snapshot and account resources', async () => {
    const clearAccountScores = vi.fn(async () => undefined);
    const clearResources = vi.fn(async () => undefined);
    const snapshots = {
      listAccountScoreSizes: vi.fn(async () => []),
      listResourceSizes: vi.fn(async () => [
        { key: 'osu:osu-standard:2', bytes: 100 },
        { key: 'osu:osu-mania:2', bytes: 200 },
        { key: 'osu:osu-catch:3', bytes: 300 },
        { key: 'account-thumbnail:osu-standard:osu:2', bytes: 10 },
        { key: 'account-avatar:osu-standard:osu:2', bytes: 20 },
        { key: 'phira:player:1', bytes: 999 },
      ]),
      clearAccountScores,
      clearResources,
    };
    const adapter = getGameStorageAdapter('osu-standard');
    // 仅 osu-standard 自身的快照 + 该模式账号的头像/缩略图（accountId 前缀归属）
    await expect(adapter?.measure(snapshots as never)).resolves.toBe(130);
    await adapter?.clear(snapshots as never);
    expect(clearAccountScores).toHaveBeenCalledWith([]);
    expect(clearResources).toHaveBeenCalledWith([
      'osu:osu-standard:2',
      'account-thumbnail:osu-standard:osu:2',
      'account-avatar:osu-standard:osu:2',
    ]);
  });
});

describe('shared cache note wording', () => {
  it('uses the unified include/exclude wording', () => {
    expect(sharedCacheNote()).toBe('临时文件与图片缓存；不含系统图标字体');
  });
});

describe('phigros resource coverage', () => {
  it('measures and clears the cloud save snapshot and account thumbnails', async () => {
    const clearAccountScores = vi.fn(async () => undefined);
    const clearResources = vi.fn(async () => undefined);
    const snapshots = {
      listAccountScoreSizes: vi.fn(async () => []),
      listResourceSizes: vi.fn(async () => [
        { key: 'phigros-save:phigros:phi-taptap:1', bytes: 100 },
        { key: 'account-thumbnail:phigros:phi-taptap:1', bytes: 20 },
        { key: 'phigros-kyou-aliases', bytes: 30 },
        { key: 'account-avatar:phigros:phi-taptap:1', bytes: 40 },
        { key: 'musedash:albums', bytes: 999 },
      ]),
      clearAccountScores,
      clearResources,
    };
    const adapter = getGameStorageAdapter('phigros');
    await expect(adapter?.measure(snapshots as never)).resolves.toBe(190);
    await adapter?.clear(snapshots as never);
    expect(clearAccountScores).toHaveBeenCalledWith([]);
    expect(clearResources).toHaveBeenCalledWith([
      'phigros-save:phigros:phi-taptap:1',
      'account-thumbnail:phigros:phi-taptap:1',
      'phigros-kyou-aliases',
      'account-avatar:phigros:phi-taptap:1',
    ]);
  });
});

describe('chunithm resource coverage', () => {
  it('clears the collection list snapshot through the game adapter', async () => {
    const clearResources = vi.fn(async () => undefined);
    const snapshots = {
      listAccountScoreSizes: vi.fn(async () => []),
      listResourceSizes: vi.fn(async () => [
        { key: 'chunithm-collections:character', bytes: 10 },
        { key: 'chunithm-collections:trophy', bytes: 20 },
        { key: 'chunithm-song-detail:803', bytes: 30 },
        { key: 'maimai:collections', bytes: 999 },
      ]),
      clearAccountScores: vi.fn(async () => undefined),
      clearResources,
    };
    const adapter = getGameStorageAdapter('chunithm');
    await expect(adapter?.measure(snapshots as never)).resolves.toBe(60);
    await adapter?.clear(snapshots as never);
    expect(clearResources).toHaveBeenCalledWith([
      'chunithm-collections:character',
      'chunithm-collections:trophy',
      'chunithm-song-detail:803',
    ]);
  });
});

describe('maimai resource coverage', () => {
  it('keeps durable local account thumbnails and clears the maimai-assets directory', async () => {
    const clearAccountScores = vi.fn(async () => undefined);
    const clearResources = vi.fn(async () => undefined);
    mocks.measureDirectoryBytes.mockReturnValueOnce(1000);
    const snapshots = {
      listAccountScoreSizes: vi.fn(async () => [
        { accountId: 'maimai:lxns:u1', bytes: 100 },
        { accountId: 'maimai:local:a', bytes: 200 },
      ]),
      listResourceSizes: vi.fn(async () => [
        { key: 'account-thumbnail:maimai:lxns:u1', bytes: 10 },
        { key: 'account-thumbnail:maimai:local:a', bytes: 20 },
        { key: 'account-avatar:maimai:local:a', bytes: 30 },
      ]),
      measureCatalogBytes: vi.fn(async () => 0),
      measureLegacyScoreBytes: vi.fn(async () => 0),
      clearCatalog: vi.fn(async () => undefined),
      clearAccountScores,
      clearResources,
    };
    const adapter = getGameStorageAdapter('maimai');
    // SQLite 可清部分 110 + maimai-assets 目录 1000
    await expect(adapter?.measure(snapshots as never)).resolves.toBe(1110);
    await adapter?.clear(snapshots as never);
    expect(clearAccountScores).toHaveBeenCalledWith(['maimai:lxns:u1']);
    expect(clearResources).toHaveBeenCalledWith(['account-thumbnail:maimai:lxns:u1']);
    expect(mocks.clearMaimaiUiCache).toHaveBeenCalledTimes(1);
  });
});

describe('clearing storage compacts the database and resets in-memory caches', () => {
  it('runs wal checkpoint and VACUUM after clearing', async () => {
    mocks.execAsync.mockClear();
    const client = {
      invalidateQueries: vi.fn(async () => undefined),
      removeQueries: vi.fn(),
    };
    await clearStorageByCategories(['maimai'], client as never);
    expect(mocks.execAsync).toHaveBeenCalledWith(expect.stringContaining('VACUUM'));
  });

  it('resets the Phigros kyou alias cache when phigros is cleared', async () => {
    mocks.resetPhigrosKyouAliasesCache.mockClear();
    const client = {
      invalidateQueries: vi.fn(async () => undefined),
      removeQueries: vi.fn(),
    };
    await clearStorageByCategories(['phigros'], client as never);
    expect(mocks.resetPhigrosKyouAliasesCache).toHaveBeenCalledTimes(1);
  });

  it('does not reset the kyou alias cache when phigros is not cleared', async () => {
    mocks.resetPhigrosKyouAliasesCache.mockClear();
    const client = {
      invalidateQueries: vi.fn(async () => undefined),
      removeQueries: vi.fn(),
    };
    await clearStorageByCategories(['maimai'], client as never);
    expect(mocks.resetPhigrosKyouAliasesCache).not.toHaveBeenCalled();
  });

  it('removes queries for every game cache namespace', async () => {
    const client = {
      invalidateQueries: vi.fn(async () => undefined),
      removeQueries: vi.fn(),
    };
    await clearStorageByCategories(['shared'], client as never);
    for (const key of [
      'tuf',
      'musedash',
      'phigros-catalog',
      'phigros-kyou-chart-tags',
      'chunithm-collections',
      'best-image-collections',
    ]) {
      expect(client.removeQueries).toHaveBeenCalledWith({ queryKey: [key] });
    }
  });
});
