import type { GameDataBundle } from '@/domain/game-data';
import type { DataSource } from '@/domain/models';
import { buildOverviewSourceStatus } from '@/features/overview/overview-source-status';

function source(label: string, isStale = false): DataSource {
  return {
    kind: 'fixture',
    label,
    updatedAt: '2026-08-20T00:00:00.000Z',
    isStale,
  };
}

function bundle(payload: Record<string, unknown>, gameId = 'maimai'): GameDataBundle {
  return {
    gameId,
    providerId: 'local',
    profile: {} as GameDataBundle['profile'],
    payload,
  } as unknown as GameDataBundle;
}

describe('overview source status', () => {
  it('固定展示主成绩与曲库，并追加已进入缓存的附加来源', () => {
    const items = buildOverviewSourceStatus(bundle({
      kind: 'maimai',
      source: source('本地成绩'),
      catalogSource: source('LXNS 曲库', true),
    }), {}, [
      { key: 'dxrating-tags', label: 'DXRating 标签', source: source('DXRating') },
      { key: 'plates', label: '舞萌姓名框' },
    ]);

    expect(items).toEqual([
      expect.objectContaining({ key: 'scores', label: '成绩/玩家 · 本地成绩', state: 'live' }),
      expect.objectContaining({ key: 'catalog', label: '曲库 · LXNS 曲库', state: 'cache' }),
      expect.objectContaining({ key: 'dxrating-tags', label: 'DXRating 标签 · DXRating', state: 'live' }),
    ]);
    expect(items.some((item) => item.key === 'plates')).toBe(false);
  });

  it('附加来源已发生错误时显示红色，未加载时省略', () => {
    const items = buildOverviewSourceStatus(bundle({
      kind: 'phigros',
      source: source('TapTap'),
      catalogSource: source('Phigros 曲库'),
    }, 'phigros'), {}, [
      { key: 'phigros-kyou-tags', label: 'Kyou 标签', error: new Error('failed') },
      { key: 'plates', label: '未加载来源' },
    ]);

    expect(items.find((item) => item.key === 'phigros-kyou-tags')).toEqual(
      expect.objectContaining({ label: 'Kyou 标签 · 暂不可用', state: 'unavailable' }),
    );
    expect(items.some((item) => item.key === 'plates')).toBe(false);
  });

  it('Phira 归并为玩家主状态与已有最佳成绩缓存状态', () => {
    const items = buildOverviewSourceStatus(bundle({
      kind: 'phira',
      source: source('Phira 玩家'),
      bests: { items: {}, source: source('Phira 最佳', true) },
    }, 'phira'), {}, []);

    expect(items.map((item) => [item.key, item.state])).toEqual([
      ['scores', 'live'],
      ['bests', 'cache'],
    ]);
  });

  it('中二未同步成绩显示红色，曲库陈旧缓存显示黄色', () => {
    const items = buildOverviewSourceStatus(bundle({
      kind: 'chunithm',
      source: source('LXNS 玩家'),
      hasSyncedData: false,
    }, 'chunithm'), { source: source('LXNS 中二曲库', true) }, []);

    expect(items).toEqual([
      expect.objectContaining({ key: 'scores', state: 'unavailable' }),
      expect.objectContaining({ key: 'catalog', state: 'cache' }),
    ]);
  });
});
