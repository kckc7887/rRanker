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
};

export const TEST_ACCOUNT_ID = 'test:empty';
export const LOCAL_MAIMAI_ACCOUNT_ID = 'maimai:local';
export const MAIMAI_TEST_ACCOUNT_ID = 'maimai:test';

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
};

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

export function createMaimaiBoundAccount(input: {
  providerId: ProviderId;
  displayName: string;
  rating: number;
  playerId?: string;
}): BoundAccount {
  const profile = getGameProfile('maimai');
  return {
    id: `maimai:${input.providerId}:${input.playerId ?? input.displayName}`,
    gameId: 'maimai',
    providerId: input.providerId,
    displayName: input.displayName,
    scoreLabel: profile.ratingLabel,
    scoreDisplay: formatPlayerScore(input.rating, profile.ratingDigits),
    providerTitle: PROVIDER_TITLES[input.providerId],
  };
}

export function groupBoundAccountGameIds(accounts: BoundAccount[]): GameId[] {
  const order: GameId[] = ['maimai', 'test', 'phigros'];
  return order.filter((gameId) => accounts.some((account) => account.gameId === gameId));
}
