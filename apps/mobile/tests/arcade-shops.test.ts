import {
  buildAndroidAmapNavigateUri,
  buildAppleMapsNavigateUri,
  buildArcadeFilterSummary,
  buildGeoNavigateUri,
  buildIosAmapNavigateUri,
  FALLBACK_ARCADE_GAME_TITLES,
  filterArcadeShops,
  formatArcadeAddress,
  formatArcadeDistanceKm,
  formatArcadeGamesSummary,
  shopMatchesGameTitles,
  shopMatchesNameKeyword,
  type ArcadeShop,
} from '@/domain/arcade-shops';

function shop(partial: Partial<ArcadeShop> & Pick<ArcadeShop, 'id' | 'name'>): ArcadeShop {
  return {
    comment: '',
    addressDetailed: '',
    addressGeneral: [],
    latitude: 31.2,
    longitude: 121.5,
    distanceKm: 1,
    games: [],
    ...partial,
  };
}

describe('arcade shop filters', () => {
  const shops: ArcadeShop[] = [
    shop({
      id: 1,
      name: '上海某某机厅',
      addressDetailed: '徐汇区某某路 1 号',
      distanceKm: 2.4,
      games: [
        { gameId: 1, titleId: 1, name: '舞萌DX', version: '', quantity: 4, cost: '' },
        { gameId: 2, titleId: 3, name: '中二节奏', version: '', quantity: 2, cost: '' },
      ],
    }),
    shop({
      id: 2,
      name: '纯中二馆',
      addressDetailed: '浦东新区',
      distanceKm: 0.8,
      games: [{ gameId: 3, titleId: 3, name: '中二节奏', version: '', quantity: 1, cost: '' }],
    }),
    shop({
      id: 3,
      name: '远方舞萌',
      addressDetailed: '',
      addressGeneral: ['中国', '浙江省'],
      distanceKm: 12,
      games: [{ gameId: 4, titleId: 1, name: '舞萌DX', version: '', quantity: 2, cost: '' }],
    }),
  ];

  it('matches shop name and address keyword', () => {
    expect(shopMatchesNameKeyword(shops[0], '上海')).toBe(true);
    expect(shopMatchesNameKeyword(shops[0], '徐汇')).toBe(true);
    expect(shopMatchesNameKeyword(shops[0], '不存在')).toBe(false);
    expect(shopMatchesNameKeyword(shops[0], '  ')).toBe(true);
  });

  it('matches game titles with OR semantics', () => {
    expect(shopMatchesGameTitles(shops[0], [1])).toBe(true);
    expect(shopMatchesGameTitles(shops[1], [1])).toBe(false);
    expect(shopMatchesGameTitles(shops[1], [1, 3])).toBe(true);
    expect(shopMatchesGameTitles(shops[0], [])).toBe(false);
  });

  it('filters and sorts by distance then name', () => {
    const filtered = filterArcadeShops(shops, { keyword: '', titleIds: [1] });
    expect(filtered.map((item) => item.id)).toEqual([1, 3]);
    expect(filtered[0].distanceKm).toBeLessThanOrEqual(filtered[1].distanceKm);
  });

  it('applies name keyword together with title filter', () => {
    const filtered = filterArcadeShops(shops, { keyword: '远方', titleIds: [1, 3] });
    expect(filtered.map((item) => item.id)).toEqual([3]);
  });
});

describe('arcade shop formatting', () => {
  it('formats address preferring detailed', () => {
    expect(formatArcadeAddress({
      addressDetailed: '详细地址',
      addressGeneral: ['中国', '上海'],
    })).toBe('详细地址');
    expect(formatArcadeAddress({
      addressDetailed: '  ',
      addressGeneral: ['中国', '上海'],
    })).toBe('中国 上海');
  });

  it('formats distance and games summary', () => {
    expect(formatArcadeDistanceKm(0.35)).toBe('350 m');
    expect(formatArcadeDistanceKm(2.4)).toBe('2.4 km');
    expect(formatArcadeGamesSummary([
      { gameId: 1, titleId: 1, name: '舞萌DX', version: '', quantity: 4, cost: '' },
      { gameId: 2, titleId: 3, name: '中二节奏', version: '', quantity: 0, cost: '' },
    ])).toBe('舞萌DX×4 · 中二节奏');
  });
});

describe('arcade filter summary', () => {
  it('summarizes radius and selected game titles', () => {
    expect(buildArcadeFilterSummary({
      radiusKm: 10,
      titleIds: [1],
      gameTitles: FALLBACK_ARCADE_GAME_TITLES,
    })).toBe('10 km · 舞萌DX');

    expect(buildArcadeFilterSummary({
      radiusKm: 5,
      titleIds: [1, 3, 4],
      gameTitles: FALLBACK_ARCADE_GAME_TITLES,
    })).toBe('5 km · 舞萌DX、中二节奏 等3种');

    expect(buildArcadeFilterSummary({
      radiusKm: 15,
      titleIds: [],
      gameTitles: FALLBACK_ARCADE_GAME_TITLES,
    })).toBe('15 km · 未选机型');
  });
});

describe('arcade navigation URIs', () => {
  const target = { name: '测试机厅', latitude: 31.23, longitude: 121.47 };

  it('builds platform navigation deep links', () => {
    expect(buildIosAmapNavigateUri(target)).toContain('iosamap://path?');
    expect(buildIosAmapNavigateUri(target)).toContain('dlat=31.23');
    expect(buildAndroidAmapNavigateUri(target)).toContain('androidamap://route?');
    expect(buildAppleMapsNavigateUri(target)).toContain('maps.apple.com');
    expect(buildAppleMapsNavigateUri(target)).toContain('daddr=31.23%2C121.47');
    expect(buildGeoNavigateUri(target)).toBe('geo:31.23,121.47?q=%E6%B5%8B%E8%AF%95%E6%9C%BA%E5%8E%85');
  });
});
