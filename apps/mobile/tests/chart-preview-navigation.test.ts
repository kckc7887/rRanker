import {
  gamePageHref, discardPluginPagePayload, resolvePluginPagePayload, stagePluginPage,
  PLUGIN_PAGE_NAVIGATION_CHECK_DELAY_MS, openPluginPage,
} from '@rranker/sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PhiraChart } from '@rranker/game-phira/domain/phira';

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

describe('Phigros / Phira 谱面确认入口交接', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it.each(PHIGROS_CASES)('Phigros 问题歌曲完整交接且不进入路由查询串：%s', (songId) => {
    const request = { game: 'phigros' as const, songId, levelIndex: 3, title: `${songId} AT` };
    const href = stagePluginPage(gamePageHref('phigros', 'chart-preview')!, request);

    expect(href.pathname).toBe('/plugins/[pluginId]/[pageId]');
    expect(href.params).toMatchObject({ pluginId: 'tool.chart-json', pageId: 'chart-preview', gameId: 'phigros' });
    expect(href.params.requestId).toMatch(/^page-[a-z0-9]+-[a-z0-9]+$/);
    expect(JSON.stringify(href)).not.toContain(songId);
    expect(resolvePluginPagePayload(href.params.requestId)).toBe(request);
  });

  it.each(PHIRA_CASES)('Phira 问题谱面完整交接元数据与素材地址：%s', (chartId) => {
    const chart = phiraChart(chartId);
    const href = stagePluginPage(gamePageHref('phira', 'chart-preview')!, { game: 'phira', chart });

    expect(JSON.stringify(href)).not.toContain(String(chartId));
    expect(resolvePluginPagePayload(href.params.requestId)).toEqual({ game: 'phira', chart });
  });

  it('丢失或主动撤销的交接返回 null，不会伪造播放器输入', () => {
    expect(resolvePluginPagePayload('missing')).toBeNull();
    const href = stagePluginPage(gamePageHref('phigros', 'chart-preview')!, { game: 'phigros', songId: 'Song.A', levelIndex: 2, title: 'Song A IN' });
    discardPluginPagePayload(href.params.requestId);
    expect(resolvePluginPagePayload(href.params.requestId)).toBeNull();
  });
});

describe('openPluginPage（跳转静默失败的兜底提示）', () => {
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
    const cancel = openPluginPage(gamePageHref('phigros', 'chart-preview'), { payload: { game: 'phigros', songId: 'Song.A', levelIndex: 3, title: 'Song A AT' },
      push,
      topRouteName: () => 'plugins/[pluginId]/[pageId]',
      onFail,
    });

    expect(push).toHaveBeenCalledTimes(1);
    const href = push.mock.calls[0]![0] as { params: { requestId: string } };
    expect(resolvePluginPagePayload(href.params.requestId)).toEqual({ game: 'phigros', songId: 'Song.A', levelIndex: 3, title: 'Song A AT' });
    vi.advanceTimersByTime(PLUGIN_PAGE_NAVIGATION_CHECK_DELAY_MS);
    expect(onFail).not.toHaveBeenCalled();
    cancel();
  });

  it('expo-router 静默丢弃跳转（顶层仍是详情页）时给出明确提示', () => {
    const push = vi.fn();
    const onFail = vi.fn();
    openPluginPage(gamePageHref('phira', 'chart-preview'), { payload: { game: 'phira', chart: phiraChart(66661) },
      push,
      topRouteName: () => 'detail',
      onFail,
    });

    expect(push).toHaveBeenCalledTimes(1);
    expect(onFail).not.toHaveBeenCalled();
    vi.advanceTimersByTime(PLUGIN_PAGE_NAVIGATION_CHECK_DELAY_MS);
    expect(onFail).toHaveBeenCalledWith('页面跳转未生效，请重试');
  });

  it('跳转同步抛错时立即提示并撤销交接', () => {
    let capturedHref: { params: { requestId: string } } | null = null;
    const push = vi.fn((href: unknown) => {
      capturedHref = href as { params: { requestId: string } };
      throw new Error('测试跳转失败');
    });
    const onFail = vi.fn();
    openPluginPage(gamePageHref('phigros', 'chart-preview'), { payload: { game: 'phigros', songId: 'Song.A', levelIndex: 2, title: 'Song A IN' },
      push, topRouteName: () => 'detail', onFail,
    });

    expect(onFail).toHaveBeenCalledWith('无法打开页面，请重试。');
    expect(capturedHref).not.toBeNull();
    expect(resolvePluginPagePayload(capturedHref!.params.requestId)).toBeNull();
  });

  it('组件卸载时取消残留校验定时器，不产生迟到提示', () => {
    const push = vi.fn();
    const onFail = vi.fn();
    const cancel = openPluginPage(gamePageHref('phigros', 'chart-preview'), { payload: { game: 'phigros', songId: 'Song.A', levelIndex: 0, title: 'Song A EZ' },
      push,
      topRouteName: () => 'detail',
      onFail,
    });
    cancel();
    vi.advanceTimersByTime(PLUGIN_PAGE_NAVIGATION_CHECK_DELAY_MS * 3);
    expect(onFail).not.toHaveBeenCalled();
  });
});
