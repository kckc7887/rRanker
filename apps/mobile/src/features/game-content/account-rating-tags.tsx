import type { ReactNode } from 'react';
import { TintedRatingTag } from '@/components/TintedRatingTag';
import { TUF_RATING_THEME } from '@/components/adofai/TufOverviewDetails';
import { MUSE_DASH_RATING_THEME } from '@/components/musedash/MuseDashOverviewDetails';
import type { BoundAccount } from '@/domain/bound-account';
import type { GameId } from '@/domain/game-bind-options';

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

export function boundAccountRatingTag(account: BoundAccount): ReactNode {
  return ACCOUNT_RATING_TAGS[account.gameId]?.(account) ?? null;
}
