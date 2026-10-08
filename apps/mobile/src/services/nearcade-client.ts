import {
  FALLBACK_ARCADE_GAME_TITLES,
  localizeArcadeGameTitleName,
  stripArcadeHtml,
  type ArcadeGameTitle,
  type ArcadeOpeningDay,
  type ArcadeShop,
  type ArcadeShopDetail,
  type ArcadeShopGame,
} from '@/domain/arcade-shops';
import { providerErrorFromStatus } from '@/providers/errors';
import { arcadeDistanceKm, fromGcj02, toGcj02 } from '@/domain/arcade-coordinates';
import { requestJson } from '@/providers/http-json';
import { bytesToBase64 } from '@/utils/crypto-subset';
import { fetch as expoFetch } from 'expo/fetch';
import { z } from 'zod';

export const NEARCADE_API_BASE = 'https://nearca.de/api';

const shopGameSchema = z.object({
  gameId: z.number(),
  titleId: z.number(),
  name: z.string(),
  version: z.string().optional().default(''),
  comment: z.string().optional().default(''),
  quantity: z.number().optional().default(0),
  cost: z.string().optional().default(''),
});

const openingTimeSchema = z.object({
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
});

const openingDaySchema = z.tuple([
  openingTimeSchema,
  openingTimeSchema.extend({ hour: z.number().int().min(0).max(47) }),
]);

const shopSchema = z.object({
  id: z.number(),
  name: z.string(),
  comment: z.string().optional().default(''),
  address: z.object({
    general: z.array(z.string()).optional().default([]),
    detailed: z.string().optional().default(''),
    region: z.array(z.object({ id: z.string() })).optional().default([]),
  }),
  location: z.object({
    type: z.literal('Point').optional(),
    coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
  }),
  games: z.array(shopGameSchema).optional().default([]),
  distance: z.number().nonnegative().nullable().optional().default(null),
  openingHours: z.array(openingDaySchema).optional().default([]),
  isOpen: z.boolean().nullable().optional().default(null),
});

const discoverResponseSchema = z.object({
  shops: z.array(shopSchema),
  radius: z.number().optional(),
  limit: z.number().optional(),
});

const searchResponseSchema = z.object({
  shops: z.array(shopSchema),
  totalCount: z.number().int().nonnegative(),
  currentPage: z.number().int().positive(),
  hasNextPage: z.boolean(),
});

export type ArcadeShopPage = { shops: ArcadeShop[]; totalCount: number; page: number; hasNextPage: boolean };

const shopDetailResponseSchema = z.object({
  shop: shopSchema,
});

const gameTitleSchema = z.object({
  id: z.number(),
  key: z.string(),
  name: z.string(),
  seats: z.number().optional().default(1),
});

const gameTitlesResponseSchema = z.object({
  titles: z.array(gameTitleSchema),
});

export type DiscoverQuery = {
  latitude: number;
  longitude: number;
  radiusKm: number;
  limit?: number;
  titleIds?: readonly number[];
  signal?: AbortSignal;
};

function mapShopGame(game: z.infer<typeof shopGameSchema>): ArcadeShopGame {
  return {
    gameId: game.gameId,
    titleId: game.titleId,
    name: stripArcadeHtml(game.name),
    version: stripArcadeHtml(game.version),
    comment: stripArcadeHtml(game.comment),
    quantity: game.quantity,
    cost: stripArcadeHtml(game.cost),
  };
}

function mapOpeningHours(hours: z.infer<typeof openingDaySchema>[]): ArcadeOpeningDay[] {
  return hours.map((day) => [
    { hour: day[0].hour, minute: day[0].minute },
    { hour: day[1].hour, minute: day[1].minute },
  ] as const);
}

function mapShop(shop: z.infer<typeof shopSchema>): ArcadeShop {
  const [longitude, latitude] = shop.location.coordinates;
  const country = shop.address.region[0]?.id;
  const domestic = country ? country === 'CN' : shop.address.general.some(part => /^(China|中国|中國)$/i.test(part));
  const coordinate = domestic ? fromGcj02({ latitude, longitude }) : { latitude, longitude };
  return {
    id: shop.id,
    name: stripArcadeHtml(shop.name),
    comment: stripArcadeHtml(shop.comment),
    addressDetailed: stripArcadeHtml(shop.address.detailed),
    addressGeneral: shop.address.general.map((part) => stripArcadeHtml(part)).filter(Boolean),
    ...coordinate,
    distanceKm: shop.distance,
    games: shop.games.map(mapShopGame),
    openingHours: mapOpeningHours(shop.openingHours),
  };
}

function mapShopDetail(shop: z.infer<typeof shopSchema>): ArcadeShopDetail {
  return {
    ...mapShop(shop),
    isOpen: shop.isOpen ?? null,
  };
}

function requestNearcade<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
  return requestJson({ baseUrl: NEARCADE_API_BASE, path, schema, signal,
    fetcher: expoFetch as unknown as typeof fetch, label: '机厅查询', totalAttempts: 1,
    error: status => providerErrorFromStatus(status, {
      rateLimit: '机厅查询过于频繁，请稍后重试', server: '机厅查询服务暂时不可用',
      fallback: { code: 'network', message: status => `机厅查询返回 HTTP ${status}` },
    }),
  });
}

function setGameFilter(params: URLSearchParams, titleIds: readonly number[] = []): void {
  if (!titleIds.length) return;
  const filter = { v: 1, games: { op: 'and', children: titleIds.map(id => ({ titleIds: [id] })) } };
  params.set('f', bytesToBase64(new TextEncoder().encode(JSON.stringify(filter)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
}

export async function fetchNearcadeDiscover(query: DiscoverQuery): Promise<ArcadeShop[]> {
  const center = toGcj02(query);
  const params = new URLSearchParams({
    latitude: String(center.latitude),
    longitude: String(center.longitude),
    radius: String(query.radiusKm),
    limit: String(query.limit ?? 150),
    fetchAttendance: 'false',
    includeTimeInfo: 'false',
  });
  setGameFilter(params, query.titleIds);
  const shops = await requestNearcade(`/discover?${params.toString()}`, z.unknown().transform(parseDiscoverResponse), query.signal);
  return shops.map(shop => ({ ...shop, distanceKm: arcadeDistanceKm(query, shop) }))
    .filter(shop => shop.distanceKm <= query.radiusKm);
}

export async function fetchNearcadeShop(shopId: number, signal?: AbortSignal): Promise<ArcadeShopDetail> {
  const params = new URLSearchParams({ includeTimeInfo: 'true' });
  return requestNearcade(`/shops/${shopId}?${params.toString()}`, z.unknown().transform(parseShopDetailResponse), signal);
}

export async function searchNearcadeShops(query: {
  keyword: string; page?: number; titleIds?: readonly number[]; signal?: AbortSignal;
}): Promise<ArcadeShopPage> {
  const params = new URLSearchParams({ q: query.keyword.trim(), page: String(query.page ?? 1), limit: '20', includeTimeInfo: 'false' });
  setGameFilter(params, query.titleIds);
  const result = await requestNearcade(`/shops?${params}`, searchResponseSchema, query.signal);
  return { shops: result.shops.map(mapShop), totalCount: result.totalCount, page: result.currentPage, hasNextPage: result.hasNextPage };
}

export async function fetchNearcadeGameTitles(signal?: AbortSignal): Promise<ArcadeGameTitle[]> {
  try {
    return await requestNearcade('/game-titles', z.unknown().transform(parseGameTitlesResponse), signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    return [...FALLBACK_ARCADE_GAME_TITLES];
  }
}

export function parseDiscoverResponse(json: unknown): ArcadeShop[] {
  return discoverResponseSchema.parse(json).shops.map(mapShop);
}

export function parseShopDetailResponse(json: unknown): ArcadeShopDetail {
  return mapShopDetail(shopDetailResponseSchema.parse(json).shop);
}

export function parseGameTitlesResponse(json: unknown): ArcadeGameTitle[] {
  return gameTitlesResponseSchema.parse(json).titles.map((title) => ({
    id: title.id,
    key: title.key,
    name: localizeArcadeGameTitleName(title.key, title.name),
    seats: title.seats,
  }));
}
