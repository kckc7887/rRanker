import type { ReactNode } from 'react';
import { TintedRatingTag } from '@/components/TintedRatingTag';
import { TUF_RATING_THEME } from '@/components/adofai/TufOverviewDetails';
import { MUSE_DASH_RATING_THEME } from '@/components/musedash/MuseDashOverviewDetails';
import type { BoundAccount } from '@/domain/bound-account';
import type { GameId } from '@/domain/game-bind-options';

/**
 * 账号行游戏专属 Rating 标签补充区（组合边界）。
 *
 * 共享账号列表只渲染公共部分：需要引用游戏模块的标签在这里按游戏登记，
 * 未登记的游戏返回 null，由公共列表继续走自身的公共主题兜底。
 */
const ACCOUNT_RATING_TAGS: Partial<Record<GameId, (account: BoundAccount) => ReactNode>> = {
  adofai: (account) => (
    <TintedRatingTag
      theme={TUF_RATING_THEME}
      display={account.scoreDisplay}
      accessibilityLabel={`RANKED SCORE ${account.scoreDisplay}`}
      testID="tuf-rating-tag"
    />
  ),
  musedash: (account) => (
    <TintedRatingTag
      theme={MUSE_DASH_RATING_THEME}
      display={account.scoreDisplay}
      accessibilityLabel={`Rating ${account.scoreDisplay}`}
      testID="musedash-rating-tag"
    />
  ),
};

/** 账号补充区解析入口；无登记时返回 null，表示该游戏没有公共列表之外的补充标签。 */
export function boundAccountRatingTag(account: BoundAccount): ReactNode {
  return ACCOUNT_RATING_TAGS[account.gameId]?.(account) ?? null;
}
