import type { GameId, ProviderId } from './game-bind-options';
import { formatPlayerScore } from './game-data';
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
  'musedash-moe': '喵斯快跑社区',
};

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

export function groupBoundAccountGameIds(accounts: BoundAccount[]): GameId[] {
  const order: GameId[] = ['maimai', 'chunithm', 'phigros', 'adofai', 'musedash', 'test'];
  return order.filter((gameId) => accounts.some((account) => account.gameId === gameId));
}
