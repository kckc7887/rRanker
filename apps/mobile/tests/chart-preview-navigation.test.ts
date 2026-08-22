import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PhiraChart } from '@/domain/phira';
import {
  discardChartPreviewNavigation,
  resolveChartPreviewNavigation,
  stageChartPreviewNavigation,
} from '@/features/phigros-chart-preview/chart-preview-navigation';
import {
  CHART_PREVIEW_NAVIGATION_CHECK_DELAY_MS,
  openChartPreviewNavigation,
} from '@/features/phigros-chart-preview/chart-preview-open';

const PHIGROS_CASES = [
  '祈-我ら神祖と共に歩む者なり-.光吉猛修VS穴山大輔VSKaiVS水野健治VS大国奏音',
  'Ramification.rareguyReina',
  'ERABYECONNEC10N.かめりあ',
  'INFiNiTEENERZYOverdoze.RekuMochizuki',
  'AvataarReincarnationofKalpa.ScarletteakaCrYmson',
] as const;

const PHIRA_CASES = [19365, 27282, 42017, 50299, 36040, 35829, 66661] as const;

function phiraChart(id: number): PhiraChart {
  return {
    id,
    name: `Phira 测试谱面 #${id}`,
    level: 'IN Lv.16',
    difficulty: 16,
    charter: '测试谱师',
    composer: '测试曲师',
    illustrator: null,
    description: null,
    ranked: false,
    stable: false,
    illustration: `https://assets.example/${id}/illustration.png`,
    preview: null,
    file: `https://assets.example/${id}/chart.zip`,
    uploader: 1,
    tags: [],
    rating: null,
    ratingCount: 0,
    created: null,
    updated: null,
    chartUpdated: null,
  };
}

describe('Phigros / Phira 谱面确认入口交接 demo', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it.each(PHIGROS_CASES)('Phigros 问题歌曲完整交接且不进入路由查询串：%s', (songId) => {
    const request = { game: 'phigros' as const, songId, levelIndex: 3, title: `${songId} AT` };
    const href = stageChartPreviewNavigation(request);

    expect(href.pathname).toBe('/songs/phigros-chart-preview');
    expect(href.params.requestId).toMatch(/^cp-[a-z0-9]+-[a-z0-9]+$/);
    expect(JSON.stringify(href)).not.toContain(songId);
    expect(resolveChartPreviewNavigation(href.params.requestId)).toEqual(request);
  });

  it.each(PHIRA_CASES)('Phira 问题谱面完整交接元数据与素材地址：%s', (chartId) => {
    const chart = phiraChart(chartId);
    const href = stageChartPreviewNavigation({ game: 'phira', chart });

    expect(JSON.stringify(href)).not.toContain(String(chartId));
    expect(resolveChartPreviewNavigation(href.params.requestId)).toEqual({ game: 'phira', chart });
  });

  it('丢失或主动撤销的交接返回 null，不会伪造播放器输入', () => {
    expect(resolveChartPreviewNavigation('missing')).toBeNull();
    const href = stageChartPreviewNavigation({
      game: 'phigros', songId: 'Song.A', levelIndex: 2, title: 'Song A IN',
    });
    discardChartPreviewNavigation(href.params.requestId);
    expect(resolveChartPreviewNavigation(href.params.requestId)).toBeNull();
  });
});

describe('openChartPreviewNavigation（跳转静默失败的兜底提示）', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('跳转成功时正常交接且不误报失败', () => {
    const push = vi.fn();
    const onFail = vi.fn();
    const cancel = openChartPreviewNavigation({
      game: 'phigros', songId: 'Song.A', levelIndex: 3, title: 'Song A AT',
    }, {
      push,
      topRouteName: () => 'songs/phigros-chart-preview',
      onFail,
    });

    expect(push).toHaveBeenCalledTimes(1);
    const href = push.mock.calls[0]![0] as { params: { requestId: string } };
    expect(resolveChartPreviewNavigation(href.params.requestId)).toEqual({
      game: 'phigros', songId: 'Song.A', levelIndex: 3, title: 'Song A AT',
    });
    vi.advanceTimersByTime(CHART_PREVIEW_NAVIGATION_CHECK_DELAY_MS);
    expect(onFail).not.toHaveBeenCalled();
    cancel();
  });

  it('expo-router 静默丢弃跳转（顶层仍是详情页）时给出明确提示', () => {
    const push = vi.fn();
    const onFail = vi.fn();
    openChartPreviewNavigation({ game: 'phira', chart: phiraChart(66661) }, {
      push,
      topRouteName: () => 'songs/[songId]',
      onFail,
    });

    expect(push).toHaveBeenCalledTimes(1);
    expect(onFail).not.toHaveBeenCalled();
    vi.advanceTimersByTime(CHART_PREVIEW_NAVIGATION_CHECK_DELAY_MS);
    expect(onFail).toHaveBeenCalledWith('页面跳转未生效，请重试');
  });

  it('跳转同步抛错时立即提示并撤销交接', () => {
    let capturedHref: { params: { requestId: string } } | null = null;
    const push = vi.fn((href: unknown) => {
      capturedHref = href as { params: { requestId: string } };
      throw new Error('测试跳转失败');
    });
    const onFail = vi.fn();
    openChartPreviewNavigation({ game: 'phigros', songId: 'Song.A', levelIndex: 2, title: 'Song A IN' }, {
      push, topRouteName: () => 'songs/[songId]', onFail,
    });

    expect(onFail).toHaveBeenCalledWith('无法打开谱面，请重试。');
    expect(capturedHref).not.toBeNull();
    expect(resolveChartPreviewNavigation(capturedHref!.params.requestId)).toBeNull();
  });

  it('组件卸载时取消残留校验定时器，不产生迟到提示', () => {
    const push = vi.fn();
    const onFail = vi.fn();
    const cancel = openChartPreviewNavigation({
      game: 'phigros', songId: 'Song.A', levelIndex: 0, title: 'Song A EZ',
    }, {
      push,
      topRouteName: () => 'songs/[songId]',
      onFail,
    });
    cancel();
    vi.advanceTimersByTime(CHART_PREVIEW_NAVIGATION_CHECK_DELAY_MS * 3);
    expect(onFail).not.toHaveBeenCalled();
  });
});
