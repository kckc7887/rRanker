import {
  buildAndroidAmapNavigateUri,
  buildAppleMapsNavigateUri,
  buildArcadeFilterSummary,
  buildArcadeMapNavigateUri,
  buildBaiduMapsNavigateUri,
  buildIosAmapNavigateUri,
  FALLBACK_ARCADE_GAME_TITLES,
  filterArcadeShops,
  formatArcadeAddress,
  formatArcadeDistanceKm,
  formatArcadeGamesSummary,
  formatArcadeBusinessStatus,
  formatArcadeGeocodedLabel,
  formatArcadeOpeningHoursLines,
  listArcadeMapApps,
  resolveArcadeBusinessStatus,
  shopMatchesGameTitles,
  shopMatchesNameKeyword,
  stripArcadeHtml,
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
    openingHours: [],
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
        { gameId: 1, titleId: 1, name: '舞萌DX', version: '', comment: '', quantity: 4, cost: '' },
        { gameId: 2, titleId: 3, name: '中二节奏', version: '', comment: '', quantity: 2, cost: '' },
      ],
    }),
    shop({
      id: 2,
      name: '纯中二馆',
      addressDetailed: '浦东新区',
      distanceKm: 0.8,
      games: [{ gameId: 3, titleId: 3, name: '中二节奏', version: '', comment: '', quantity: 1, cost: '' }],
    }),
    shop({
      id: 3,
      name: '远方舞萌',
      addressDetailed: '',
      addressGeneral: ['中国', '浙江省'],
      distanceKm: 12,
      games: [{ gameId: 4, titleId: 1, name: '舞萌DX', version: '', comment: '', quantity: 2, cost: '' }],
    }),
  ];

  it('matches shop name and address keyword', () => {
    expect(shopMatchesNameKeyword(shops[0], '上海')).toBe(true);
    expect(shopMatchesNameKeyword(shops[0], '徐汇')).toBe(true);
    expect(shopMatchesNameKeyword(shops[0], '不存在')).toBe(false);
    expect(shopMatchesNameKeyword(shops[0], '  ')).toBe(true);
  });

  it('matches game titles with AND semantics', () => {
    expect(shopMatchesGameTitles(shops[0], [1])).toBe(true);
    expect(shopMatchesGameTitles(shops[1], [1])).toBe(false);
    expect(shopMatchesGameTitles(shops[1], [1, 3])).toBe(false);
    expect(shopMatchesGameTitles(shops[0], [1, 3])).toBe(true);
    expect(shopMatchesGameTitles(shops[0], [])).toBe(false);
  });

  it('filters and sorts by distance then name', () => {
    const filtered = filterArcadeShops(shops, { keyword: '', titleIds: [1] });
    expect(filtered.map((item) => item.id)).toEqual([1, 3]);
    expect(filtered[0].distanceKm).toBeLessThanOrEqual(filtered[1].distanceKm);
  });

  it('requires all selected titles when filtering multiple games', () => {
    expect(filterArcadeShops(shops, { keyword: '', titleIds: [1, 3] }).map((item) => item.id)).toEqual([1]);
  });

  it('applies name keyword together with title filter', () => {
    const filtered = filterArcadeShops(shops, { keyword: '远方', titleIds: [1] });
    expect(filtered.map((item) => item.id)).toEqual([3]);
    expect(filterArcadeShops(shops, { keyword: '远方', titleIds: [1, 3] })).toEqual([]);
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
      { gameId: 1, titleId: 1, name: '舞萌DX', version: '', comment: '', quantity: 4, cost: '' },
      { gameId: 2, titleId: 3, name: '中二节奏', version: '', comment: '', quantity: 0, cost: '' },
    ])).toBe('舞萌DX×4 · 中二节奏');
  });
});

describe('stripArcadeHtml', () => {
  it('removes tags and decodes common entities', () => {
    expect(stripArcadeHtml('<b>舞萌</b>DX<br>新框&nbsp;1台')).toBe('舞萌DX\n新框 1台');
    expect(stripArcadeHtml('A &amp; B &lt;C&gt;')).toBe('A & B <C>');
    expect(stripArcadeHtml('  <p>备注</p>  ')).toBe('备注');
  });
});

describe('arcade opening hours formatting', () => {
  it('formats business status labels and daily/weekly hours', () => {
    expect(formatArcadeBusinessStatus('open')).toBe('营业中');
    expect(formatArcadeBusinessStatus('closing_soon')).toBe('将休息');
    expect(formatArcadeBusinessStatus('closed')).toBe('休息中');
    expect(formatArcadeBusinessStatus('unknown')).toBe('营业状态未知');
    expect(formatArcadeOpeningHoursLines([])).toEqual(['营业时间未知']);
    expect(formatArcadeOpeningHoursLines([
      [{ hour: 10, minute: 0 }, { hour: 22, minute: 30 }],
    ])).toEqual(['每日 10:00–22:30']);
    // index 0 = Sunday … 6 = Saturday (Date#getDay)
    expect(formatArcadeOpeningHoursLines([
      [{ hour: 10, minute: 0 }, { hour: 22, minute: 0 }],
      [{ hour: 10, minute: 0 }, { hour: 22, minute: 0 }],
      [{ hour: 10, minute: 0 }, { hour: 22, minute: 0 }],
      [{ hour: 10, minute: 0 }, { hour: 22, minute: 0 }],
      [{ hour: 10, minute: 0 }, { hour: 22, minute: 0 }],
      [{ hour: 10, minute: 0 }, { hour: 22, minute: 0 }],
      [{ hour: 12, minute: 0 }, { hour: 23, minute: 0 }],
    ])[6]).toBe('周六 12:00–23:00');
  });

  it('resolves open / closing_soon / closed from local clock', () => {
    const hours = [[{ hour: 10, minute: 0 }, { hour: 22, minute: 0 }]] as const;
    expect(resolveArcadeBusinessStatus(hours, new Date(2026, 6, 26, 12, 0))).toBe('open');
    expect(resolveArcadeBusinessStatus(hours, new Date(2026, 6, 26, 21, 55))).toBe('closing_soon');
    expect(resolveArcadeBusinessStatus(hours, new Date(2026, 6, 26, 22, 0))).toBe('closed');
    expect(resolveArcadeBusinessStatus(hours, new Date(2026, 6, 26, 9, 0))).toBe('closed');
    expect(resolveArcadeBusinessStatus([], new Date(2026, 6, 26, 12, 0))).toBe('unknown');
  });

  it('supports overnight opening hours', () => {
    const hours = [[{ hour: 18, minute: 0 }, { hour: 2, minute: 0 }]] as const;
    expect(resolveArcadeBusinessStatus(hours, new Date(2026, 6, 26, 20, 0))).toBe('open');
    expect(resolveArcadeBusinessStatus(hours, new Date(2026, 6, 26, 1, 55))).toBe('closing_soon');
    expect(resolveArcadeBusinessStatus(hours, new Date(2026, 6, 26, 3, 0))).toBe('closed');
  });
});

describe('arcade geocoded origin label', () => {
  it('joins city district and street when available', () => {
    expect(formatArcadeGeocodedLabel({
      city: '上海市',
      district: '徐汇区',
      street: '漕溪北路',
      streetNumber: '88号',
    })).toBe('上海市徐汇区漕溪北路88号');
  });

  it('falls back to region or generic label', () => {
    expect(formatArcadeGeocodedLabel({ region: '上海市' })).toBe('上海市');
    expect(formatArcadeGeocodedLabel({})).toBe('已选位置');
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

  it('prefixes origin label when provided', () => {
    expect(buildArcadeFilterSummary({
      radiusKm: 10,
      titleIds: [1],
      gameTitles: FALLBACK_ARCADE_GAME_TITLES,
      originLabel: '徐家汇',
    })).toBe('徐家汇 · 10 km · 舞萌DX');
  });
});

describe('arcade navigation URIs', () => {
  const target = {
    name: '测试机厅',
    addressDetailed: '上海市徐汇区某某路 1 号',
    addressGeneral: ['中国', '上海市'],
  };

  it('lists map apps by platform', () => {
    expect(listArcadeMapApps('ios').map((app) => app.id)).toEqual(['apple', 'amap', 'baidu']);
    expect(listArcadeMapApps('android').map((app) => app.id)).toEqual(['amap', 'baidu']);
  });

  it('builds platform navigation deep links from address', () => {
    const destination = '上海市徐汇区某某路 1 号';
    const iosUri = buildIosAmapNavigateUri(target);
    const androidUri = buildAndroidAmapNavigateUri(target);
    const appleUri = buildAppleMapsNavigateUri(target);
    const baiduUri = buildBaiduMapsNavigateUri(target);
    expect(iosUri.startsWith('iosamap://path?')).toBe(true);
    expect(iosUri).not.toContain('dlat=');
    expect(new URLSearchParams(iosUri.split('?')[1]).get('dname')).toBe(destination);
    expect(androidUri.startsWith('androidamap://route?')).toBe(true);
    expect(new URLSearchParams(androidUri.split('?')[1]).get('dname')).toBe(destination);
    expect(appleUri).toContain('maps.apple.com');
    expect(new URLSearchParams(appleUri.split('?')[1]).get('daddr')).toBe(destination);
    expect(baiduUri.startsWith('baidumap://map/direction?')).toBe(true);
    expect(new URLSearchParams(baiduUri.split('?')[1]).get('destination')).toBe(destination);
    expect(buildArcadeMapNavigateUri('amap', target, 'ios')).toBe(iosUri);
    expect(buildArcadeMapNavigateUri('amap', target, 'android')).toBe(androidUri);
  });

  it('falls back to shop name when address is empty', () => {
    const fallback = { name: '仅店名机厅', addressDetailed: '', addressGeneral: [] };
    expect(new URLSearchParams(buildBaiduMapsNavigateUri(fallback).split('?')[1]).get('destination'))
      .toBe('仅店名机厅');
  });
});
