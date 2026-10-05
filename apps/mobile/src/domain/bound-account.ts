import { GAME_OPTIONS, type GameId, type ProviderId } from './game-bind-options';
import { majdataAvatarUrl } from './majdata';
import { formatPlayerScore } from './game-data';
import { isOsuGameId, type OsuGameId } from './game-mode-family';
import { getGameProfile } from './game-profile';

export type BoundAccount = {
  id: string;
  gameId: GameId;
  providerId: ProviderId | null;
  displayName: string;
  scoreLabel: string;
  scoreDisplay: string;
  providerTitle: string;
  avatarUrl?: string | null;
  challengeModeRank?: number | null;
  ratingPossession?: string | null;
};

export const LOCAL_MAIMAI_ACCOUNT_ID = 'maimai:local';
export const MAIMAI_TEST_ACCOUNT_ID = 'maimai:test';
export const CHUNITHM_TEST_ACCOUNT_ID = 'chunithm:test';
export const PHIGROS_TEST_ACCOUNT_ID = 'phigros:test';
export const CHUNITHM_TEMP_ACCOUNT_ID = 'chunithm:temp';
/** 示例 ID 含非 hex 字符，与真实 user_id 区分。 */
export const MUSEDASH_TEST_USER_ID = 'rranker-demo-maxed';
export const MUSEDASH_TEST_ACCOUNT_ID = `musedash:musedash-moe:${MUSEDASH_TEST_USER_ID}`;

export function isMuseDashTestUserId(userId: string): boolean {
  return userId === MUSEDASH_TEST_USER_ID;
}

export function isLocalMaimaiAccountId(accountId: string): boolean {
  return accountId === LOCAL_MAIMAI_ACCOUNT_ID
    || accountId.startsWith(`${LOCAL_MAIMAI_ACCOUNT_ID}:`);
}

export function createAdditionalLocalMaimaiAccountId(
  existingAccountIds: readonly string[],
  now = Date.now(),
): string {
  const base = `${LOCAL_MAIMAI_ACCOUNT_ID}:${now.toString(36)}`;
  let candidate = base;
  let suffix = 2;
  while (existingAccountIds.includes(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

const PROVIDER_TITLES: Record<ProviderId, string> = {
  'rizline-official': '官方账号',
  'majdata-net': 'Majdata Net',
  'diving-fish': '水鱼查分器',
  lxns: '落雪查分器',
  local: '本地查分器',
  'maimai-test': '示例查分器',
  'chunithm-test': '示例查分器',
  'phigros-test': '示例查分器',
  'phi-taptap': 'TapTap 云存档',
  'chunithm-temp': '无成绩临时账号',
  tuf: 'TUF 社区',
  'musedash-moe': 'MuseDash.moe',
  'phira-community': 'Phira社区',
  'musedash-test': '示例查分器',
  osu: 'osu! 官方',
};

export function createRizlineBoundAccount(input: {
  userId: string; username: string; totalRks?: number | null;
}): BoundAccount {
  return {
    id: `rizline:official:${input.userId}`,
    gameId: 'rizline',
    providerId: 'rizline-official',
    displayName: input.username,
    scoreLabel: getGameProfile('rizline').ratingLabel,
    scoreDisplay: input.totalRks == null || !Number.isFinite(input.totalRks) ? '—' : input.totalRks.toFixed(4),
    providerTitle: PROVIDER_TITLES['rizline-official'],
  };
}

export function rizlineUserIdFromAccountId(accountId: string): string | null {
  const prefix = 'rizline:official:';
  return accountId.startsWith(prefix) && accountId.length > prefix.length ? accountId.slice(prefix.length) : null;
}

export function createMajdataBoundAccount(input: {
  accountId: string; displayName: string; scoreDisplay?: string; avatarUrl?: string | null;
}): BoundAccount {
  return {
    id: input.accountId,
    gameId: 'majdata-net',
    providerId: 'majdata-net',
    displayName: input.displayName,
    scoreLabel: getGameProfile('majdata-net').ratingLabel,
    scoreDisplay: input.scoreDisplay ?? '—',
    providerTitle: PROVIDER_TITLES['majdata-net'],
    avatarUrl: input.avatarUrl ?? majdataAvatarUrl(input.displayName),
  };
}

export function createPhiraBoundAccount(input: {
  playerId: number; displayName: string; rks?: number | null; avatarUrl?: string | null;
}): BoundAccount {
  const profile = getGameProfile('phira');
  return {
    id: `phira:community:${input.playerId}`,
    gameId: 'phira',
    providerId: 'phira-community',
    displayName: input.displayName,
    scoreLabel: profile.ratingLabel,
    scoreDisplay: input.rks == null || !Number.isFinite(input.rks) ? '—' : input.rks.toFixed(4),
    providerTitle: PROVIDER_TITLES['phira-community'],
    avatarUrl: input.avatarUrl,
  };
}

export function phiraPlayerIdFromAccountId(accountId: string): number | null {
  const match = /^phira:community:(\d+)$/.exec(accountId);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function createTufBoundAccount(input: {
  playerId: number;
  displayName: string;
  avatarUrl?: string | null;
  rankedScore?: number | null;
}): BoundAccount {
  const profile = getGameProfile('adofai');
  return {
    id: `adofai:tuf:${input.playerId}`,
    gameId: 'adofai',
    providerId: 'tuf',
    displayName: input.displayName,
    scoreLabel: profile.ratingLabel,
    scoreDisplay: input.rankedScore == null || !Number.isFinite(input.rankedScore) ? '—' : input.rankedScore.toFixed(2),
    providerTitle: PROVIDER_TITLES.tuf,
    avatarUrl: input.avatarUrl,
  };
}

export function tufPlayerIdFromAccountId(accountId: string): number | null {
  const match = /^adofai:tuf:(\d+)$/.exec(accountId);
  if (!match) return null;
  const playerId = Number(match[1]);
  return Number.isSafeInteger(playerId) && playerId > 0 ? playerId : null;
}

export function createMuseDashBoundAccount(input: {
  userId: string;
  displayName: string;
  rl?: number | null;
}): BoundAccount {
  const profile = getGameProfile('musedash');
  return {
    id: `musedash:musedash-moe:${input.userId}`,
    gameId: 'musedash',
    providerId: 'musedash-moe',
    displayName: input.displayName,
    scoreLabel: profile.ratingLabel,
    scoreDisplay: input.rl == null || !Number.isFinite(input.rl) ? '—' : input.rl.toFixed(2),
    providerTitle: PROVIDER_TITLES['musedash-moe'],
  };
}

export function museDashUserIdFromAccountId(accountId: string): string | null {
  const match = /^musedash:musedash-moe:(.+)$/.exec(accountId);
  return match ? match[1] : null;
}

export function createMaxedMuseDashTestAccount(
  rl = 0,
  displayName = '示例账号',
): BoundAccount {
  const profile = getGameProfile('musedash');
  return {
    id: MUSEDASH_TEST_ACCOUNT_ID,
    gameId: 'musedash',
    providerId: 'musedash-test',
    displayName,
    scoreLabel: profile.ratingLabel,
    scoreDisplay: Number.isFinite(rl) ? rl.toFixed(2) : '—',
    providerTitle: PROVIDER_TITLES['musedash-test'],
  };
}

export function createLocalMaimaiAccount(
  displayName: string,
  rating: number,
  accountId = LOCAL_MAIMAI_ACCOUNT_ID,
): BoundAccount {
  const profile = getGameProfile('maimai');
  return {
    id: accountId,
    gameId: 'maimai',
    providerId: 'local',
    displayName,
    scoreLabel: profile.ratingLabel,
    scoreDisplay: formatPlayerScore(rating, profile.ratingDigits),
    providerTitle: PROVIDER_TITLES.local,
  };
}

export function createMaxedMaimaiTestAccount(
  rating = 0,
  displayName = '示例账号',
  accountId = MAIMAI_TEST_ACCOUNT_ID,
): BoundAccount {
  const profile = getGameProfile('maimai');
  return {
    id: accountId,
    gameId: 'maimai',
    providerId: 'maimai-test',
    displayName,
    scoreLabel: profile.ratingLabel,
    scoreDisplay: formatPlayerScore(rating, profile.ratingDigits),
    providerTitle: PROVIDER_TITLES['maimai-test'],
  };
}

export function createChunithmTempAccount(): BoundAccount {
  const profile = getGameProfile('chunithm');
  return {
    id: CHUNITHM_TEMP_ACCOUNT_ID,
    gameId: 'chunithm',
    providerId: 'chunithm-temp',
    displayName: '临时账号',
    scoreLabel: profile.ratingLabel,
    scoreDisplay: '—',
    providerTitle: PROVIDER_TITLES['chunithm-temp'],
    ratingPossession: null,
  };
}

export function createMaxedChunithmTestAccount(
  rating = 0,
  displayName = '示例账号',
): BoundAccount {
  const profile = getGameProfile('chunithm');
  return {
    id: CHUNITHM_TEST_ACCOUNT_ID,
    gameId: 'chunithm',
    providerId: 'chunithm-test',
    displayName,
    scoreLabel: profile.ratingLabel,
    scoreDisplay: Number.isFinite(rating) ? rating.toFixed(2) : '—',
    providerTitle: PROVIDER_TITLES['chunithm-test'],
    ratingPossession: 'rainbow',
  };
}

export function createMaxedPhigrosTestAccount(
  rating = 0,
  displayName = '示例账号',
): BoundAccount {
  const profile = getGameProfile('phigros');
  return {
    id: PHIGROS_TEST_ACCOUNT_ID,
    gameId: 'phigros',
    providerId: 'phigros-test',
    displayName,
    scoreLabel: profile.ratingLabel,
    scoreDisplay: Number.isFinite(rating) ? rating.toFixed(4) : '—',
    providerTitle: PROVIDER_TITLES['phigros-test'],
    challengeModeRank: null,
  };
}

export function createChunithmBoundAccount(input: {
  displayName: string;
  rating: number | null;
  playerId?: string;
  accountId?: string;
  avatarUrl?: string | null;
  ratingPossession?: string | null;
}): BoundAccount {
  const profile = getGameProfile('chunithm');
  return {
    id: input.accountId ?? `chunithm:lxns:${input.playerId ?? input.displayName}`,
    gameId: 'chunithm',
    providerId: 'lxns',
    displayName: input.displayName,
    scoreLabel: profile.ratingLabel,
    scoreDisplay: input.rating === null || !Number.isFinite(input.rating)
      ? '—'
      : input.rating.toFixed(2),
    providerTitle: PROVIDER_TITLES.lxns,
    avatarUrl: input.avatarUrl,
    ratingPossession: input.ratingPossession ?? null,
  };
}

export function createMaimaiBoundAccount(input: {
  providerId: ProviderId;
  displayName: string;
  rating: number;
  playerId?: string;
  accountId?: string;
}): BoundAccount {
  const profile = getGameProfile('maimai');
  return {
    id: input.accountId ?? `maimai:${input.providerId}:${input.playerId ?? input.displayName}`,
    gameId: 'maimai',
    providerId: input.providerId,
    displayName: input.displayName,
    scoreLabel: profile.ratingLabel,
    scoreDisplay: formatPlayerScore(input.rating, profile.ratingDigits),
    providerTitle: PROVIDER_TITLES[input.providerId],
  };
}

export function createPhigrosBoundAccount(input: {
  playerId: string;
  rating: number;
  challengeModeRank?: number | null;
}): BoundAccount {
  const profile = getGameProfile('phigros');
  return {
    id: `phigros:phi-taptap:${input.playerId}`,
    gameId: 'phigros',
    providerId: 'phi-taptap',
    displayName: input.playerId,
    scoreLabel: profile.ratingLabel,
    scoreDisplay: Number.isFinite(input.rating) ? input.rating.toFixed(4) : '—',
    providerTitle: PROVIDER_TITLES['phi-taptap'],
    challengeModeRank: input.challengeModeRank ?? null,
  };
}

/** osu! 各模式分别绑定账号，共用凭据。 */
export function createOsuBoundAccount(input: {
  gameId: OsuGameId;
  userId: number;
  displayName: string;
  pp: number | null;
  avatarUrl?: string | null;
}): BoundAccount {
  const profile = getGameProfile(input.gameId);
  return {
    id: `${input.gameId}:osu:${input.userId}`,
    gameId: input.gameId,
    providerId: 'osu',
    displayName: input.displayName,
    scoreLabel: profile.ratingLabel,
    /** scoreDisplay 回读时使用 Number()，不能带千分位。 */
    scoreDisplay: input.pp == null || !Number.isFinite(input.pp) ? '—' : String(Math.round(input.pp)),
    providerTitle: PROVIDER_TITLES.osu,
    avatarUrl: input.avatarUrl,
  };
}

export function osuUserIdFromAccountId(accountId: string): number | null {
  const match = /^osu-(standard|mania|catch|taiko):osu:(\d+)$/.exec(accountId);
  if (!match) return null;
  const userId = Number(match[2]);
  return Number.isSafeInteger(userId) && userId > 0 ? userId : null;
}

export function boundAccountFromStored(account: {
  id: string;
  gameId: GameId;
  providerId: ProviderId;
  displayName: string;
  scoreDisplay: string;
  challengeModeRank?: number | null;
  ratingPossession?: string | null;
}): BoundAccount {
  if (account.gameId === 'rizline' && account.providerId === 'rizline-official') {
    return createRizlineBoundAccount({ userId: rizlineUserIdFromAccountId(account.id) ?? account.id,
      username: account.displayName, totalRks: account.scoreDisplay === '—' ? null : Number(account.scoreDisplay) });
  }
  if (account.gameId === 'majdata-net') return createMajdataBoundAccount({ ...account, accountId: account.id });
  if (account.gameId === 'phigros' && account.providerId === 'phi-taptap') {
    const rating = Number(account.scoreDisplay);
    const restored = createPhigrosBoundAccount({
      playerId: account.id.slice('phigros:phi-taptap:'.length),
      rating: Number.isFinite(rating) ? rating : 0,
      challengeModeRank: account.challengeModeRank,
    });
    return {
      ...restored,
      id: account.id,
      displayName: account.displayName,
      ...(Number.isFinite(rating) ? {} : { scoreDisplay: '—' }),
    };
  }
  if (account.gameId === 'chunithm' && account.providerId === 'lxns') {
    const rating = Number(account.scoreDisplay);
    return createChunithmBoundAccount({
      accountId: account.id,
      displayName: account.displayName,
      rating: Number.isFinite(rating) ? rating : null,
      ratingPossession: account.ratingPossession,
    });
  }
  if (isOsuGameId(account.gameId) && account.providerId === 'osu') {
    const pp = Number(account.scoreDisplay);
    return createOsuBoundAccount({
      gameId: account.gameId,
      userId: osuUserIdFromAccountId(account.id) ?? 0,
      displayName: account.displayName,
      pp: Number.isFinite(pp) && account.scoreDisplay !== '—' ? pp : null,
    });
  }
  return createMaimaiBoundAccount({
    providerId: account.providerId,
    displayName: account.displayName,
    rating: Number.parseInt(account.scoreDisplay, 10) || 0,
    playerId: account.id.split(':').slice(2).join(':') || account.displayName,
  });
}

export function groupBoundAccountGameIds(accounts: BoundAccount[]): GameId[] {
  const registered = [...GAME_OPTIONS].sort((a, b) =>
    (a.accountOrder ?? Number.MAX_SAFE_INTEGER) - (b.accountOrder ?? Number.MAX_SAFE_INTEGER));
  const order = [...new Set([...registered.map(game => game.id), ...accounts.map(account => account.gameId)])];
  return order.filter((gameId) => accounts.some((account) => account.gameId === gameId));
}
