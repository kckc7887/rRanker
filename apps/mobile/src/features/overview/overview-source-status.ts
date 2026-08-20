import type { GameDataBundle } from '@/domain/game-data';
import type { DataSource, SourceStatusItem } from '@/domain/models';

export type OverviewCachedSource = {
  key: SourceStatusItem['key'];
  label: string;
  source?: DataSource;
  error?: unknown;
};

type CatalogState = {
  source?: DataSource;
  error?: unknown;
};

function sourceItem(
  key: SourceStatusItem['key'],
  category: string,
  source: DataSource,
): SourceStatusItem {
  return {
    key,
    label: `${category} · ${source.label}`,
    updatedAt: source.updatedAt,
    state: source.isStale ? 'cache' : 'live',
  };
}

function cachedSourceItem(input: OverviewCachedSource): SourceStatusItem | null {
  if (input.error) {
    return {
      key: input.key,
      label: input.source
        ? `${input.label} · ${input.source.label}（刷新失败）`
        : `${input.label} · 暂不可用`,
      updatedAt: input.source?.updatedAt,
      state: 'unavailable',
    };
  }
  return input.source ? sourceItem(input.key, input.label, input.source) : null;
}

/** 总览“数据状态”卡的唯一状态模型；附加来源未进入 React Query 缓存时直接省略。 */
export function buildOverviewSourceStatus(
  bundle: GameDataBundle,
  catalog: CatalogState,
  cachedSources: readonly OverviewCachedSource[],
): SourceStatusItem[] {
  const items: SourceStatusItem[] = [];
  const payload = bundle.payload;

  if (payload.kind === 'unsupported') return items;
  if (payload.kind === 'empty') {
    items.push(sourceItem('scores', '成绩/玩家', payload.source));
  } else if (payload.kind === 'chunithm') {
    items.push(payload.hasSyncedData
      ? sourceItem('scores', '成绩/玩家', payload.source)
      : {
          key: 'scores',
          label: '成绩/玩家 · 落雪账号尚未同步中二数据',
          updatedAt: payload.source.updatedAt,
          state: 'unavailable',
        });
    const catalogItem = cachedSourceItem({ key: 'catalog', label: '曲库', ...catalog });
    if (catalogItem) items.push(catalogItem);
    else items.push({ key: 'catalog', label: '曲库 · LXNS 中二节奏公共曲库暂不可用', state: 'unavailable' });
  } else if (payload.kind === 'maimai' || payload.kind === 'phigros') {
    items.push(sourceItem('scores', '成绩/玩家', payload.source));
    items.push(sourceItem('catalog', '曲库', payload.catalogSource));
  } else {
    items.push(sourceItem('scores', '成绩/玩家', payload.source));
    if (payload.kind === 'adofai' || payload.kind === 'osu') {
      items.push(sourceItem('catalog', '曲库', payload.source));
    }
    if (payload.kind === 'phira' && payload.bests) {
      items.push(sourceItem('bests', '最佳成绩', payload.bests.source));
    }
  }

  for (const input of cachedSources) {
    const item = cachedSourceItem(input);
    if (item) items.push(item);
  }
  return items;
}
