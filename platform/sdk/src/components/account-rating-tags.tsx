import type { ReactNode } from 'react';
import type { BoundAccount } from '../account';
import { getGameAdapter, getGameDefinition } from '../registry';
import { TintedRatingTag } from './TintedRatingTag';

export function boundAccountRatingTag(account: BoundAccount): ReactNode {
  const Rating = getGameAdapter(account.gameId)?.accountRating;
  if (Rating) return <Rating account={account} />;
  const theme = getGameDefinition(account.gameId)?.accountScoreTheme;
  return theme ? <TintedRatingTag theme={theme} display={account.scoreDisplay}
    accessibilityLabel={account.scoreLabel + ' ' + account.scoreDisplay} /> : null;
}
