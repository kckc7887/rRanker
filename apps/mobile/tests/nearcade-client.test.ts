import { afterEach, vi } from 'vitest';
import {
  fetchNearcadeDiscover,
  fetchNearcadeGameTitles,
  parseDiscoverResponse,
  parseGameTitlesResponse,
  parseShopDetailResponse,
} from '@/services/nearcade-client';

describe('nearcade client parsing', () => {
  it('maps discover shops into domain models', () => {
    const shops = parseDiscoverResponse({
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
      radius: 10,
      limit: 150,
    });

    expect(shops).toEqual([
      {
        id: 42,
        name: '示例机厅',
        comment: '备注',
        addressDetailed: '某某路 1 号',
        addressGeneral: ['中国', '上海市'],
        latitude: 31.23,
        longitude: 121.47,
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
      latitude: 31.2,
      longitude: 121.5,
      distanceKm: 0,
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
});


describe('nearcade shared transport', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
  it('classifies HTTP and schema failures through the common provider errors', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 429 })).mockResolvedValueOnce(new Response('{"shops":"bad"}'));
    vi.stubGlobal('fetch', fetcher);
    const query = { latitude: 31, longitude: 121, radiusKm: 10 };
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
    const pending = fetchNearcadeDiscover({ latitude: 31, longitude: 121, radiusKm: 10 });
    const check = expect(pending).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(12_000); await check;
  });
});
