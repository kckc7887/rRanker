import { afterEach, vi } from 'vitest';
import {
  fetchNearcadeDiscover,
  fetchNearcadeGameTitles,
  searchNearcadeShops,
  parseGameTitlesResponse,
  parseShopDetailResponse,
} from '@/services/nearcade-client';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('nearcade client parsing', () => {
  it('maps search shops into domain models', async () => {
    const payload = {
      shops: [
        {
          id: 42,
          name: '示例机厅',
          comment: '备注',
          address: {
            general: ['中国', '上海市'],
            detailed: '某某路 1 号',
          },
          location: {
            type: 'Point',
            coordinates: [121.47, 31.23],
          },
          games: [
            {
              gameId: 100,
              titleId: 1,
              name: '舞萌DX',
              version: 'BUDDiES PLUS',
              quantity: 4,
              cost: '1币1局',
            },
          ],
          distance: 1.25,
        },
      ],
      totalCount: 1, currentPage: 1, hasNextPage: false,
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(payload))));
    const { shops } = await searchNearcadeShops({ keyword: '示例' });

    expect(shops).toEqual([
      {
        id: 42,
        name: '示例机厅',
        comment: '备注',
        addressDetailed: '某某路 1 号',
        addressGeneral: ['中国', '上海市'],
        latitude: expect.closeTo(31.23194, 4),
        longitude: expect.closeTo(121.46547, 4),
        distanceKm: 1.25,
        games: [
          {
            gameId: 100,
            titleId: 1,
            name: '舞萌DX',
            version: 'BUDDiES PLUS',
            comment: '',
            quantity: 4,
            cost: '1币1局',
          },
        ],
        openingHours: [],
      },
    ]);
  });

  it('maps shop detail with opening hours and open status', () => {
    const shop = parseShopDetailResponse({
      shop: {
        id: 7,
        name: '详情机厅',
        comment: '有空调',
        address: {
          general: ['中国', '上海市'],
          detailed: '测试路 2 号',
        },
        location: {
          type: 'Point',
          coordinates: [121.5, 31.2],
        },
        games: [
          {
            gameId: 1,
            titleId: 1,
            name: '舞萌DX',
            version: 'PRiSM',
            comment: '新框',
            quantity: 2,
            cost: '1币',
          },
        ],
        openingHours: [[{ hour: 10, minute: 0 }, { hour: 22, minute: 0 }]],
        isOpen: true,
      },
    });

    expect(shop).toEqual({
      id: 7,
      name: '详情机厅',
      comment: '有空调',
      addressDetailed: '测试路 2 号',
      addressGeneral: ['中国', '上海市'],
      latitude: expect.closeTo(31.20203, 4),
      longitude: expect.closeTo(121.49557, 4),
      distanceKm: null,
      games: [
        {
          gameId: 1,
          titleId: 1,
          name: '舞萌DX',
          version: 'PRiSM',
          comment: '新框',
          quantity: 2,
          cost: '1币',
        },
      ],
      openingHours: [[{ hour: 10, minute: 0 }, { hour: 22, minute: 0 }]],
      isOpen: true,
    });
    expect(shop.openingHours).toEqual([[{ hour: 10, minute: 0 }, { hour: 22, minute: 0 }]]);
  });

  it('strips html from shop text fields', () => {
    const shop = parseShopDetailResponse({
      shop: {
        id: 8,
        name: '<b>标签店</b>',
        comment: '备注<br><b>加粗</b>',
        address: { general: ['中国'], detailed: '路&nbsp;1号' },
        location: { type: 'Point', coordinates: [121.5, 31.2] },
        games: [{
          gameId: 1,
          titleId: 1,
          name: '<i>舞萌</i>DX',
          version: 'v1',
          comment: '机台<br>说明',
          quantity: 1,
          cost: '1币',
        }],
        openingHours: [],
        isOpen: null,
      },
    });
    expect(shop.name).toBe('标签店');
    expect(shop.comment).toBe('备注\n加粗');
    expect(shop.addressDetailed).toBe('路 1号');
    expect(shop.games[0].name).toBe('舞萌DX');
    expect(shop.games[0].comment).toBe('机台\n说明');
  });

  it('localizes known game title keys', () => {
    const titles = parseGameTitlesResponse({
      titles: [
        { id: 1, key: 'maimai_dx', name: 'maimai DX', seats: 2 },
        { id: 3, key: 'chunithm', name: 'CHUNITHM', seats: 1 },
      ],
    });
    expect(titles).toEqual([
      { id: 1, key: 'maimai_dx', name: '舞萌DX', seats: 2 },
      { id: 3, key: 'chunithm', name: '中二节奏', seats: 1 },
    ]);
  });

  it('keeps overseas WGS84 coordinates and accepts next-day closing times', async () => {
    const payload = { shops: [{ id: 9, name: '海外店',
      address: { region: [{ id: 'JP' }], general: ['Japan'] },
      location: { coordinates: [130.4, 33.6] },
      openingHours: [[{ hour: 10, minute: 0 }, { hour: 47, minute: 30 }]],
    }], totalCount: 1, currentPage: 1, hasNextPage: false };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(payload))));
    const result = await searchNearcadeShops({ keyword: '海外店' });
    expect(result.shops[0]).toMatchObject({ longitude: 130.4, latitude: 33.6, distanceKm: null,
      openingHours: [[{ hour: 10, minute: 0 }, { hour: 47, minute: 30 }]] });
  });
});


describe('nearcade shared transport', () => {
  it('loads the selected distance range across pages without nearby exclusions using up the result limit', async () => {
    const shop = (id: number, latitude: number) => ({ id, name: String(id),
      address: { region: [{ id: 'JP' }] }, location: { coordinates: [130.4, latitude] } });
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ shops: [shop(1, 33.61), shop(2, 33.7)],
        totalCount: 4, currentPage: 1, hasNextPage: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ shops: [shop(3, 33.78), shop(4, 33.88)],
        totalCount: 4, currentPage: 2, hasNextPage: false })));
    vi.stubGlobal('fetch', fetcher);
    const result = await fetchNearcadeDiscover({ latitude: 33.6, longitude: 130.4,
      minDistanceKm: 6, radiusKm: 23, titleIds: [1, 3], limit: 2 });
    expect(result.map(shop => shop.id)).toEqual([2, 3]);
    expect(result.every(shop => shop.distanceKm! >= 6 && shop.distanceKm! <= 23)).toBe(true);
    const urls = fetcher.mock.calls.map(call => new URL(String(call[0])));
    expect(urls.map(url => url.searchParams.get('page'))).toEqual(['1', '2']);
    expect(urls[0].pathname).toBe('/api/shops');
    expect(urls[0].searchParams.get('sort')).toBe('distance');
    expect(JSON.parse(Buffer.from(urls[0].searchParams.get('f')!, 'base64url').toString())).toEqual({
      v: 1, geo: expect.objectContaining({ mode: 'near', radiusKm: 23 }),
      games: { op: 'and', children: [{ titleIds: [1] }, { titleIds: [3] }] },
    });
  });

  it('keeps zero distance exact and leaves machines unrestricted when none are selected', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      shops: [0, 0.001].map((offset, id) => ({ id, name: String(id), address: { region: [{ id: 'JP' }] },
        location: { coordinates: [130.4, 33.6 + offset] } })),
      totalCount: 2, currentPage: 1, hasNextPage: false,
    })));
    vi.stubGlobal('fetch', fetcher);
    const result = await fetchNearcadeDiscover({ latitude: 33.6, longitude: 130.4, minDistanceKm: 0, radiusKm: 0 });
    expect(result.map(shop => [shop.id, shop.distanceKm])).toEqual([[0, 0]]);
    const url = new URL(String(fetcher.mock.calls[0][0]));
    expect(JSON.parse(Buffer.from(url.searchParams.get('f')!, 'base64url').toString())).toEqual({
      v: 1, geo: expect.objectContaining({ mode: 'near', radiusKm: 1 }),
    });
  });

  it('cancels a pending nearby page instead of returning partial results', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      shops: [{ id: 1, name: '近处机厅', address: { region: [{ id: 'JP' }] }, location: { coordinates: [130.4, 33.6] } }],
      totalCount: 2, currentPage: 1, hasNextPage: true,
    }))).mockImplementationOnce(() => new Promise(() => undefined));
    vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();
    const pending = fetchNearcadeDiscover({ latitude: 33.6, longitude: 130.4,
      minDistanceKm: 5, radiusKm: 30, signal: controller.signal });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('searches across cities with game filters and twenty results per page, without a radius', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      shops: [{ id: 7, name: '跨城机厅', address: { region: [{ id: 'JP' }] }, location: { coordinates: [130.4, 33.6] } }],
      totalCount: 41, currentPage: 2, hasNextPage: true,
    })));
    vi.stubGlobal('fetch', fetcher);
    const result = await searchNearcadeShops({ keyword: ' 福冈 ', page: 2, titleIds: [1, 3] });
    const url = new URL(String(fetcher.mock.calls[0][0]));
    expect(url.pathname).toBe('/api/shops');
    expect(url.searchParams.get('q')).toBe('福冈');
    expect(url.searchParams.get('limit')).toBe('20');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.has('radius')).toBe(false);
    expect(JSON.parse(Buffer.from(url.searchParams.get('f')!, 'base64url').toString())).toEqual({ v: 1, games: { op: 'and', children: [{ titleIds: [1] }, { titleIds: [3] }] } });
    expect(result).toMatchObject({ totalCount: 41, page: 2, hasNextPage: true, shops: [{ id: 7, longitude: 130.4, latitude: 33.6, distanceKm: null }] });
  });
  it('classifies HTTP and schema failures through the common provider errors', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 429 })).mockResolvedValueOnce(new Response('{"shops":"bad"}'));
    vi.stubGlobal('fetch', fetcher);
    const query = { latitude: 31, longitude: 121, minDistanceKm: 0, radiusKm: 10 };
    await expect(fetchNearcadeDiscover(query)).rejects.toMatchObject({ code: 'rate_limit' });
    await expect(fetchNearcadeDiscover(query)).rejects.toMatchObject({ code: 'upstream_schema' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('does not turn cancellation into a successful fallback title list', async () => {
    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
    const pending = fetchNearcadeGameTitles(controller.signal);
    const reason = new Error('cancel'); controller.abort(reason);
    await expect(pending).rejects.toBe(reason);
  });
  it('bounds requests even when the underlying transport ignores abort', async () => {
    vi.useFakeTimers(); vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
    const pending = fetchNearcadeDiscover({ latitude: 31, longitude: 121, minDistanceKm: 0, radiusKm: 10 });
    const check = expect(pending).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(12_000); await check;
  });
});
