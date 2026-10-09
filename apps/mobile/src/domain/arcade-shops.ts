export type ArcadeShopGame = {
  gameId: number;
  titleId: number;
  name: string;
  version: string;
  comment: string;
  quantity: number;
  cost: string;
};

export type ArcadeOpeningTime = {
  hour: number;
  minute: number;
};

/** 营业时间数组长 1 表示整周通用，长 7 表示周一至周日。 */
export type ArcadeOpeningDay = readonly [ArcadeOpeningTime, ArcadeOpeningTime];

export type ArcadeShop = {
  id: number;
  name: string;
  comment: string;
  addressDetailed: string;
  addressGeneral: string[];
  latitude: number;
  longitude: number;
  distanceKm: number | null;
  games: ArcadeShopGame[];
  openingHours: ArcadeOpeningDay[];
};

export type ArcadeShopDetail = ArcadeShop & {
  isOpen: boolean | null;
};

/** 沿用 nearcade 的关门前 10 分钟提示。 */
export const ARCADE_CLOSING_SOON_MINUTES = 10;

export type ArcadeBusinessStatus = 'open' | 'closing_soon' | 'closed' | 'unknown';

export type ArcadeGameTitle = {
  id: number;
  key: string;
  name: string;
  seats: number;
};

export const ARCADE_MAX_DISTANCE_KM = 30;

/** /game-titles 不可用时使用静态名称。 */
export const FALLBACK_ARCADE_GAME_TITLES: readonly ArcadeGameTitle[] = [
  { id: 1, key: 'maimai_dx', name: '舞萌DX', seats: 2 },
  { id: 2, key: 'maimai', name: 'maimai', seats: 2 },
  { id: 3, key: 'chunithm', name: '中二节奏', seats: 1 },
  { id: 4, key: 'sound_voltex', name: '音律炫动', seats: 1 },
  { id: 5, key: 'beatmania_iidx', name: 'beatmania IIDX', seats: 2 },
  { id: 6, key: 'jubeat', name: 'jubeat (国际版)', seats: 1 },
  { id: 7, key: 'nostalgia', name: 'Nostalgia', seats: 1 },
  { id: 8, key: 'gd_guitarfreaks', name: 'GuitarFreaks', seats: 2 },
  { id: 9, key: 'gd_drummania', name: 'DrumMania', seats: 1 },
  { id: 10, key: 'dancerush', name: 'DANCERUSH STARDOM', seats: 2 },
  { id: 11, key: 'dance_dance_revolution', name: 'Dance Dance Revolution', seats: 2 },
  { id: 12, key: 'popn_music', name: "pop'n music", seats: 1 },
  { id: 13, key: 'danceevolution', name: 'DanceEvolution', seats: 2 },
  { id: 14, key: 'reflec_beat', name: 'REFLEC BEAT', seats: 2 },
  { id: 15, key: 'taiko_no_tatsujin_old', name: '太鼓之达人 (旧代)', seats: 2 },
  { id: 16, key: 'groove_coaster', name: '音炫轨道', seats: 1 },
  { id: 17, key: 'wacca', name: '华卡音舞', seats: 1 },
  { id: 19, key: 'pump_it_up', name: '泵动巅峰', seats: 2 },
  { id: 20, key: 'top_star', name: '星光', seats: 1 },
  { id: 21, key: 'djmax_technika', name: 'DJMAX Technika', seats: 1 },
  { id: 22, key: 'percussion_master', name: '鼓王', seats: 2 },
  { id: 23, key: 'danzbase', name: '舞力特区', seats: 2 },
  { id: 24, key: 'project_diva_arcade', name: '初音未来 歌姬计划 Arcade', seats: 1 },
  { id: 27, key: 'ongeki', name: '音击', seats: 1 },
  { id: 29, key: 'dance_around', name: 'DANCE aROUND', seats: 2 },
  { id: 31, key: 'taiko_no_tatsujin', name: '太鼓之达人', seats: 2 },
  { id: 33, key: 'dance3_evo', name: '舞立方EVO', seats: 2 },
  { id: 34, key: 'jubeat_cn', name: 'jubeat音乐魔方', seats: 1 },
];

const FALLBACK_NAME_BY_KEY = new Map(FALLBACK_ARCADE_GAME_TITLES.map((title) => [title.key, title.name]));

export function localizeArcadeGameTitleName(key: string, apiName: string): string {
  return FALLBACK_NAME_BY_KEY.get(key) ?? apiName;
}

export function stripArcadeHtml(value: string): string {
  return value
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*p\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function formatArcadeAddress(shop: Pick<ArcadeShop, 'addressDetailed' | 'addressGeneral'>): string {
  const detailed = shop.addressDetailed.trim();
  if (detailed) return detailed;
  return shop.addressGeneral.filter(Boolean).join(' ');
}

export function formatArcadeDistanceKm(distanceKm: number | null): string {
  if (distanceKm === null || !Number.isFinite(distanceKm) || distanceKm < 0) return '—';
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m`;
  return `${distanceKm.toFixed(distanceKm < 10 ? 1 : 0)} km`;
}

export function formatArcadeGamesSummary(games: readonly ArcadeShopGame[]): string {
  if (games.length === 0) return '暂无机台信息';
  return games
    .map((game) => {
      const qty = Number.isFinite(game.quantity) && game.quantity > 0 ? `×${game.quantity}` : '';
      return `${game.name}${qty}`;
    })
    .join(' · ');
}

const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const;

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function minutesOfDay(time: ArcadeOpeningTime): number {
  return time.hour * 60 + time.minute;
}

export function formatArcadeClock(time: ArcadeOpeningTime): string {
  return `${time.hour >= 24 ? '次日 ' : ''}${pad2(time.hour % 24)}:${pad2(time.minute)}`;
}

export function formatArcadeOpeningSlot(day: ArcadeOpeningDay): string {
  return `${formatArcadeClock(day[0])}–${formatArcadeClock(day[1])}`;
}

export function formatArcadeBusinessStatus(status: ArcadeBusinessStatus): string {
  switch (status) {
    case 'open':
      return '营业中';
    case 'closing_soon':
      return '将休息';
    case 'closed':
      return '休息中';
    default:
      return '营业状态未知';
  }
}

/** 上游以 24–47 时表示次日，周营业表从周一开始。 */
export function resolveArcadeBusinessStatus(
  openingHours: readonly ArcadeOpeningDay[],
  now: Date = new Date(),
  closingSoonMinutes: number = ARCADE_CLOSING_SOON_MINUTES,
): ArcadeBusinessStatus {
  if (openingHours.length !== 1 && openingHours.length !== 7) return 'unknown';
  const weekday = (now.getDay() + 6) % 7;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let minutesToClose = 0;
  for (const offset of [0, 1]) {
    const slot = openingHours[openingHours.length === 1 ? 0 : (weekday - offset + 7) % 7];
    const minute = nowMin + offset * 1440;
    const open = minutesOfDay(slot[0]);
    const close = minutesOfDay(slot[1]);
    if (minute >= open && minute < close) minutesToClose = Math.max(minutesToClose, close - minute);
  }
  if (minutesToClose === 0) return 'closed';
  if (minutesToClose <= closingSoonMinutes) return 'closing_soon';
  return 'open';
}

export function formatArcadeOpeningHoursLines(openingHours: readonly ArcadeOpeningDay[]): string[] {
  if (openingHours.length === 0) return ['营业时间未知'];
  if (openingHours.length === 1) {
    return [`每日 ${formatArcadeOpeningSlot(openingHours[0])}`];
  }
  if (openingHours.length === 7) {
    return openingHours.map((day, index) => `${WEEKDAY_LABELS[index]} ${formatArcadeOpeningSlot(day)}`);
  }
  return openingHours.map((day, index) => `时段 ${index + 1} ${formatArcadeOpeningSlot(day)}`);
}

export function shopMatchesNameKeyword(
  shop: Pick<ArcadeShop, 'name' | 'addressDetailed'>,
  keyword: string,
): boolean {
  const q = keyword.normalize('NFKC').trim().toLowerCase();
  if (!q) return true;
  const name = shop.name.normalize('NFKC').toLowerCase();
  const address = shop.addressDetailed.normalize('NFKC').toLowerCase();
  return name.includes(q) || address.includes(q);
}

/** 多选游戏取交集。 */
export function shopMatchesGameTitles(
  shop: Pick<ArcadeShop, 'games'>,
  titleIds: readonly number[],
): boolean {
  if (titleIds.length === 0) return true;
  const present = new Set(shop.games.map((game) => game.titleId));
  return titleIds.every((titleId) => present.has(titleId));
}

export function filterArcadeShops(
  shops: readonly ArcadeShop[],
  options: { keyword: string; titleIds: readonly number[] },
): ArcadeShop[] {
  return shops
    .filter((shop) => shopMatchesNameKeyword(shop, options.keyword))
    .filter((shop) => shopMatchesGameTitles(shop, options.titleIds))
    .slice()
    .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) || a.name.localeCompare(b.name, 'zh'));
}

export type ArcadeOriginSource = 'gps' | 'custom';

export type ArcadeOrigin = {
  source: ArcadeOriginSource;
  latitude: number;
  longitude: number;
  label: string;
};

export function formatArcadeGeocodedLabel(parts: {
  city?: string | null;
  district?: string | null;
  subregion?: string | null;
  street?: string | null;
  streetNumber?: string | null;
  name?: string | null;
  region?: string | null;
}): string {
  const street = [parts.street, parts.streetNumber].filter(Boolean).join('');
  const chunks = [
    parts.city,
    parts.district || parts.subregion,
    street || parts.name,
  ].filter((part): part is string => Boolean(part && part.trim()));
  if (chunks.length > 0) return chunks.join('');
  const region = parts.region?.trim();
  return region || '已选位置';
}

export function buildArcadeFilterSummary(options: {
  minDistanceKm: number;
  radiusKm: number;
  titleIds: readonly number[];
  gameTitles: readonly ArcadeGameTitle[];
}): string {
  const selectedNames = options.gameTitles
    .filter((title) => options.titleIds.includes(title.id))
    .map((title) => title.name);
  const gamesLabel = selectedNames.length === 0
    ? '任意机型'
    : selectedNames.length <= 2
      ? selectedNames.join('、')
      : `${selectedNames.slice(0, 2).join('、')} 等${selectedNames.length}种`;
  return `${options.minDistanceKm}–${options.radiusKm} km · ${gamesLabel}`;
}

export type ArcadeNavigateTarget = Pick<ArcadeShop, 'name' | 'addressDetailed' | 'addressGeneral'>;

export type ArcadeMapAppId = 'apple' | 'amap' | 'baidu';

export type ArcadeMapAppOption = {
  id: ArcadeMapAppId;
  label: string;
};

export function resolveArcadeNavigateDestination(shop: ArcadeNavigateTarget): string {
  const address = formatArcadeAddress(shop).trim();
  return address || shop.name.trim();
}

export function listArcadeMapApps(platform: 'ios' | 'android' | 'windows' | 'macos' | 'web'): readonly ArcadeMapAppOption[] {
  const shared: ArcadeMapAppOption[] = [
    { id: 'amap', label: '高德地图' },
    { id: 'baidu', label: '百度地图' },
  ];
  if (platform === 'ios') {
    return [{ id: 'apple', label: '苹果地图' }, ...shared];
  }
  return shared;
}

export function buildIosAmapNavigateUri(shop: ArcadeNavigateTarget): string {
  const params = new URLSearchParams({
    sourceApplication: 'rRanker',
    dname: resolveArcadeNavigateDestination(shop),
    dev: '0',
    t: '0',
  });
  return `iosamap://path?${params.toString()}`;
}

export function buildAppleMapsNavigateUri(shop: ArcadeNavigateTarget): string {
  const destination = resolveArcadeNavigateDestination(shop);
  const params = new URLSearchParams({
    daddr: destination,
    q: destination,
  });
  return `http://maps.apple.com/?${params.toString()}`;
}

export function buildAndroidAmapNavigateUri(shop: ArcadeNavigateTarget): string {
  const params = new URLSearchParams({
    sourceApplication: 'rRanker',
    dname: resolveArcadeNavigateDestination(shop),
    dev: '0',
    t: '0',
  });
  return `androidamap://route?${params.toString()}`;
}

export function buildBaiduMapsNavigateUri(shop: ArcadeNavigateTarget): string {
  const destination = resolveArcadeNavigateDestination(shop);
  const params = new URLSearchParams({
    destination,
    mode: 'driving',
    src: 'rRanker',
  });
  return `baidumap://map/direction?${params.toString()}`;
}

export function buildArcadeMapNavigateUri(
  app: ArcadeMapAppId,
  shop: ArcadeNavigateTarget,
  platform: 'ios' | 'android' | 'windows' | 'macos' | 'web',
): string {
  switch (app) {
    case 'apple':
      return buildAppleMapsNavigateUri(shop);
    case 'amap':
      return platform === 'ios' ? buildIosAmapNavigateUri(shop) : buildAndroidAmapNavigateUri(shop);
    case 'baidu':
      return buildBaiduMapsNavigateUri(shop);
  }
}
