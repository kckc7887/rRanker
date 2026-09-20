import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { rizlineCatalog, rizlineCatalogAssetFiles, rizlineChart, rizlineSong } from './fixtures/rizline';
import {
  loadRizlineChartPreviewResources,
  resolveRizlineChartPreviewBundle,
} from '@/domain/rizline-chart-preview';
import { rizlineResources } from '@/services/rizline-resources';
import { applyRizlineChartPreviewConfigToHtml } from '@/features/rizline-chart-preview/rizline-chart-preview-inject';
import {
  normalizeRizlineChartPreviewSettings,
  parseRizlineChartPreviewTarget,
} from '@/features/rizline-chart-preview/configuration';
import {
  openRizlineChartPreview,
  RIZLINE_CHART_PREVIEW_DETAIL_ROUTE,
  RIZLINE_CHART_PREVIEW_NAVIGATION_CHECK_DELAY_MS,
} from '@/features/rizline-chart-preview/chart-preview-open';
import { chartPreviewNativeScreenOptions } from '@/features/chart-preview-shared/chart-preview-native-screen-options';
import type { RizlineRelease } from '@/services/rizline-resources';

vi.mock('@/storage/sqlite-snapshot-repository', () => ({ SqliteSnapshotRepository: class {} }));

const hash = 'a'.repeat(64);

function release(): RizlineRelease {
  const snapshot = rizlineCatalog();
  return {
    snapshot,
    source: { kind: 'rizline', label: 'Rizline 曲库', updatedAt: '2026-09-20T00:00:00.000Z', isStale: false },
    files: [
      { path: 'rizline/releases/r1/catalog.json', size: 1, sha256: hash },
      ...rizlineCatalogAssetFiles(snapshot).map((file) => ({ ...file, sha256: hash })),
    ],
  };
}

describe('Rizline chart preview resource resolution', () => {
  it('locates the unique chart JSON and shared m4a from the current release', () => {
    const bundle = resolveRizlineChartPreviewBundle(release(), { songId: 'Song.A.0', levelIndex: 2 });
    expect(bundle.chart.difficulty).toBe('IN');
    expect(bundle.chart.path).toBe('rizline/releases/r1/charts/Song.A.0.IN.json');
    expect(bundle.music.path).toBe('rizline/releases/r1/audio/Song.A.0.m4a');
    expect(bundle.chart.url).toContain('/rizline/releases/r1/charts/Song.A.0.IN.json');
    expect(bundle.music.url).toContain('/rizline/releases/r1/audio/Song.A.0.m4a');
  });

  it('rejects missing songs, difficulties and files that are not on the manifest', () => {
    const current = release();
    expect(() => resolveRizlineChartPreviewBundle(current, { songId: 'missing', levelIndex: 2 }))
      .toThrow(/数量异常/);
    expect(() => resolveRizlineChartPreviewBundle(current, { songId: 'Song.A.0', levelIndex: 0 }))
      .toThrow(/不存在 EZ/);
    expect(() => resolveRizlineChartPreviewBundle(current, { songId: 'Song.A.0', levelIndex: 9 }))
      .toThrow('缺少或无效的难度参数');
    expect(() => resolveRizlineChartPreviewBundle({
      ...current,
      snapshot: {
        ...current.snapshot,
        songs: [rizlineSong({ charts: [rizlineChart({ chartPath: 'rizline/releases/r1/charts/missing.json' })] })],
      },
    }, { songId: 'Song.A.0', levelIndex: 2 })).toThrow('谱面文件不在发布清单中');
  });

  it('loads through withRelease and verifies chart and audio bytes', async () => {
    const chartBytes = Uint8Array.from([1, 2, 3]);
    const musicBytes = Uint8Array.from([4, 5, 6, 7]);
    const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
    const current: RizlineRelease = {
      ...release(),
      files: release().files.map((file) => {
        if (file.path.endsWith('/charts/Song.A.0.IN.json')) {
          return { ...file, size: chartBytes.byteLength, sha256: digest(chartBytes) };
        }
        if (file.path.endsWith('/audio/Song.A.0.m4a')) {
          return { ...file, size: musicBytes.byteLength, sha256: digest(musicBytes) };
        }
        return file;
      }),
    };
    const withRelease = vi.spyOn(rizlineResources, 'withRelease').mockImplementation(async (action) => action(current));
    const read = vi.fn(async (asset: { path: string }) => (
      asset.path.endsWith('.json') ? chartBytes : musicBytes
    ));
    try {
      await expect(loadRizlineChartPreviewResources(
        { songId: 'Song.A.0', levelIndex: 2 },
        new AbortController().signal,
        read,
      )).resolves.toMatchObject({
        chart: { difficulty: 'IN', path: 'rizline/releases/r1/charts/Song.A.0.IN.json' },
        music: { path: 'rizline/releases/r1/audio/Song.A.0.m4a' },
      });
      expect(read).toHaveBeenCalledTimes(2);
      await expect(loadRizlineChartPreviewResources(
        { songId: 'Song.A.0', levelIndex: 2 },
        new AbortController().signal,
        async () => Uint8Array.from([9]),
      )).rejects.toThrow('Rizline 谱面校验失败');
    } finally {
      withRelease.mockRestore();
    }
  });
});

describe('Rizline chart preview configuration', () => {
  it('parses query params and normalizes settings', () => {
    expect(parseRizlineChartPreviewTarget({ songId: 'Song.A.0', levelIndex: '4', title: ' Title ' }))
      .toEqual({ songId: 'Song.A.0', levelIndex: 4, title: 'Title' });
    expect(parseRizlineChartPreviewTarget({ songId: '', levelIndex: '2' })).toBeNull();
    expect(parseRizlineChartPreviewTarget({ songId: 'a', levelIndex: '5' })).toBeNull();
    expect(normalizeRizlineChartPreviewSettings({
      playbackSpeed: 1.53, userSpeed: 20.04, volume: 2, hitSound: false, hitSoundVolume: -1,
    })).toEqual({
      playbackSpeed: 1.55, userSpeed: 20, volume: 1, hitSound: false, hitSoundVolume: 0,
    });
  });

  it('injects theme and settings without chart text or resource URLs', () => {
    const html = applyRizlineChartPreviewConfigToHtml('<!--RIZLINE_CHART_PREVIEW_CONFIG-->', {
      theme: 'dark',
      title: 'Song IN',
      settings: normalizeRizlineChartPreviewSettings({}),
    });
    expect(html).toContain('window.__RIZLINE_CHART_PREVIEW_CONFIG__=');
    expect(html).toContain('"title":"Song IN"');
    expect(html).not.toContain('preview-chart.json');
    expect(html).not.toContain('preview-music.m4a');
    expect(html).not.toContain('chartUrl');
    expect(html).not.toContain('musicUrl');
    expect(html).not.toContain('chartText');
  });
});

describe('Rizline chart preview navigation and fullscreen orientation', () => {
  it('opens the local route and reports a stuck detail screen', () => {
    vi.useFakeTimers();
    const push = vi.fn();
    const onFail = vi.fn();
    const cancel = openRizlineChartPreview({ songId: 'Song.A.0', levelIndex: 2, title: 'Song IN' }, {
      push, topRouteName: () => RIZLINE_CHART_PREVIEW_DETAIL_ROUTE, onFail,
    });
    expect(push).toHaveBeenCalledWith({
      pathname: '/songs/rizline-chart-preview',
      params: { songId: 'Song.A.0', levelIndex: '2', title: 'Song IN' },
    });
    vi.advanceTimersByTime(RIZLINE_CHART_PREVIEW_NAVIGATION_CHECK_DELAY_MS);
    expect(onFail).toHaveBeenCalledWith('页面跳转未生效，请重试');
    cancel();
    vi.useRealTimers();
  });

  it('keeps existing games landscape and lets Rizline stay portrait when fullscreen', () => {
    expect(chartPreviewNativeScreenOptions(true, 'android')).toMatchObject({ orientation: 'landscape' });
    expect(chartPreviewNativeScreenOptions(true, 'ios', '谱面确认', 'portrait_up')).toMatchObject({
      orientation: 'portrait_up', headerShown: false, autoHideHomeIndicator: true,
    });
    expect(chartPreviewNativeScreenOptions(false, 'android', '谱面确认', 'portrait_up')).toMatchObject({
      orientation: 'portrait_up', headerShown: true,
    });
  });
});
