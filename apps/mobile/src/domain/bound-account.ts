import type { GameId, ProviderId } from './game-bind-options';
import { formatPlayerScore } from './game-data';
import { isOsuGameId, type OsuGameId } from './game-mode-family';
import { getGameProfile } from './game-profile';

/** 已绑定账号：切换列表展开后的一页行（图标由 UI 按 provider/game 解析）。 */
export type BoundAccount = {
  id: string;
  gameId: GameId;
  providerId: ProviderId | null;
  displayName: string;
  /** 如 DX RATING */
  scoreLabel: string;
  /** 展示用分数，空为 — */
  scoreDisplay: string;
  providerTitle: string;
  /** 玩家头像 URL；Phigros / 落雪等远程账号优先展示。 */
  avatarUrl?: string | null;
  /** Phigros 课题模式分数；旧账号未刷新前为空。 */
  challengeModeRank?: number | null;
  /** 中二节奏 Rating 领域；旧账号未刷新前为空。 */
  ratingPossession?: string | null;
};

export const TEST_ACCOUNT_ID = 'test:empty';
export const LOCAL_MAIMAI_ACCOUNT_ID = 'maimai:local';
export const MAIMAI_TEST_ACCOUNT_ID = 'maimai:test';
export const CHUNITHM_TEST_ACCOUNT_ID = 'chunithm:test';
export const PHIGROS_TEST_ACCOUNT_ID = 'phigros:test';
export const CHUNITHM_TEMP_ACCOUNT_ID = 'chunithm:temp';
/** 喵斯示例账号的哨兵 user_id；含非 hex 字符，与真实 32 位 hex user_id 永不冲突。 */
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

export function createTestBoundAccount(): BoundAccount {
  return {
    id: TEST_ACCOUNT_ID,
    gameId: 'test',
    providerId: null,
    displayName: '测试游戏',
    scoreLabel: 'Rating',
    scoreDisplay: '—',
    providerTitle: '空数据',
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

/**
 * osu! 模式账号：一个 osu 用户按模式各绑定一个账号，账号 id 含模式与用户 id；
 * 凭据（credentialId）跨模式共享，由会话层统一管理。
 */
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
    // 不千分位：账号行 scoreDisplay 需可被 Number() 解析恢复（会话库回读）。
    scoreDisplay: input.pp == null || !Number.isFinite(input.pp) ? '—' : String(Math.round(input.pp)),
    providerTitle: PROVIDER_TITLES.osu,
    avatarUrl: input.avatarUrl,
  };
}

/** 从 osu 模式账号 id 解析 osu 用户 id；非 osu 账号返回 null。 */
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
  if (account.gameId === 'phigros' && account.providerId === 'phi-taptap') {
    const rating = Number(account.scoreDisplay);
    const restored = createPhigrosBoundAccount({
      playerId: account.displayName,
      rating: Number.isFinite(rating) ? rating : 0,
      challengeModeRank: account.challengeModeRank,
    });
    return Number.isFinite(rating) ? restored : { ...restored, scoreDisplay: '—' };
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
  const order: GameId[] = [
    'maimai', 'chunithm', 'phigros', 'phira', 'adofai', 'musedash',
    'osu-standard', 'osu-mania', 'osu-catch', 'osu-taiko', 'test',
  ];
  return order.filter((gameId) => accounts.some((account) => account.gameId === gameId));
}
