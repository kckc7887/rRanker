import { isOsuGameId } from '@/domain/game-mode-family';
import { OsuRatingTag } from '@/components/osu/OsuRatingTag';
import { ChunithmRatingTag } from '@/components/ChunithmRatingTag';
import { DxRatingTag } from '@/components/DxRatingTag';
import { PhigrosAccountTags } from '@/components/PhigrosAccountTags';
import type { ReactNode } from 'react';
import { TintedRatingTag } from '@/components/TintedRatingTag';
import { TUF_RATING_THEME } from '@/components/adofai/TufOverviewDetails';
import { MUSE_DASH_RATING_THEME } from '@/components/musedash/MuseDashOverviewDetails';
import type { BoundAccount } from '@/domain/bound-account';
import { findGame, type GameId } from '@/domain/game-bind-options';

const ACCOUNT_RATING_TAGS: Partial<Record<GameId, (account: BoundAccount) => ReactNode>> = {
  maimai: account => {
    const rating = Number.parseInt(account.scoreDisplay, 10);
    return <DxRatingTag rating={Number.isFinite(rating) ? rating : null} display={account.scoreDisplay} />;
  },
  chunithm: account => <ChunithmRatingTag display={account.scoreDisplay} ratingPossession={account.ratingPossession} />,
  phigros: account => <PhigrosAccountTags rks={account.scoreDisplay} challengeModeRank={account.challengeModeRank} />,
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
  if (isOsuGameId(account.gameId) && (account.providerId === 'osu' || account.providerId === 'osu-test')) {
    return <OsuRatingTag display={account.scoreDisplay} />;
  }
  const render = ACCOUNT_RATING_TAGS[account.gameId];
  if (render) return render(account);
  const theme = findGame(account.gameId)?.accountScoreTheme;
  return theme ? <TintedRatingTag theme={theme} display={account.scoreDisplay}
    accessibilityLabel={account.scoreLabel + ' ' + account.scoreDisplay} /> : null;
}
