import { render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { processColor } from 'react-native';
import { BoundAccountGroupedList } from '@/components/BoundAccountGroupedList';
import { TUF_RATING_THEME } from '@/components/adofai/TufOverviewDetails';
import { MUSE_DASH_RATING_THEME } from '@/components/musedash/MuseDashOverviewDetails';
import {
  createChunithmBoundAccount,
  createMuseDashBoundAccount,
  createPhigrosBoundAccount,
  createTufBoundAccount,
} from '@/domain/bound-account';
import { resolvePhigrosChallengeTheme } from '@/domain/phigros-challenge-theme';
import { resolveChunithmPossessionTheme, resolveChunithmRatingTierBorder } from '@/domain/chunithm-rating-theme';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/services/hydrate-bound-account-avatars', () => ({ hydrateBoundAccountAvatars: jest.fn(async () => undefined) }));
jest.mock('@/services/account-thumbnail', () => ({ hydrateBoundAccountThumbnails: jest.fn(async () => undefined) }));
jest.mock('@/services/hydrate-chunithm-account-summaries', () => ({ hydrateChunithmAccountSummaries: jest.fn(async () => undefined) }));
jest.mock('@/services/hydrate-phigros-account-summaries', () => ({ hydratePhigrosAccountSummaries: jest.fn(async () => undefined) }));
jest.mock('@/components/BoundAccountAvatar', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return { BoundAccountAvatar: () => <RN.View /> };
});

describe('BoundAccountGroupedList Phigros metadata', () => {
  it('shows a numeric-only RKS tag tinted with the challenge mode colors', async () => {
    const account = createPhigrosBoundAccount({ playerId: 'PhiPlayer', rating: 15.4321, challengeModeRank: 523 });
    const screen = await render(<BoundAccountGroupedList
      accounts={[account]} expandedGameId="phigros" activeAccountId={account.id}
      onToggleGame={jest.fn()} onSelectAccount={jest.fn()}
    />);
    const challenge = resolvePhigrosChallengeTheme(523);

    expect(screen.getByLabelText('RKS 15.43')).toBeTruthy();
    expect(screen.getByText('15.43')).toBeTruthy();
    expect(screen.queryByText('RKS')).toBeNull();
    expect(screen.queryByText('课题模式')).toBeNull();
    expect(screen.getByTestId('phigros-rks-tag-border').props.colors)
      .toEqual(challenge.borderColors.map((color) => processColor(color)));
    expect(screen.getByTestId('phigros-rks-tag').props.colors)
      .toEqual(challenge.fillColors.map((color) => processColor(color)));
    expect(screen.getByText('当前')).toBeTruthy();
    expect(screen.getByText('TapTap 云存档')).toBeTruthy();
  });

  it('falls back to the white challenge theme when no challenge mode data exists', async () => {
    const account = createPhigrosBoundAccount({ playerId: 'PhiPlayer', rating: 15.4321 });
    const screen = await render(<BoundAccountGroupedList
      accounts={[account]} expandedGameId="phigros" activeAccountId={account.id}
      onToggleGame={jest.fn()} onSelectAccount={jest.fn()}
    />);
    const challenge = resolvePhigrosChallengeTheme(0);

    expect(screen.getByLabelText('RKS 15.43')).toBeTruthy();
    expect(screen.getByTestId('phigros-rks-tag-border').props.colors)
      .toEqual(challenge.borderColors.map((color) => processColor(color)));
    expect(screen.getByTestId('phigros-rks-tag').props.colors)
      .toEqual(challenge.fillColors.map((color) => processColor(color)));
    expect(screen.queryByText('课题模式')).toBeNull();
  });
});

describe('BoundAccountGroupedList Chunithm metadata', () => {
  it('shows a numeric-only Rating tag with the possession background', async () => {
    const account = createChunithmBoundAccount({
      displayName: '中二玩家',
      playerId: '123456789',
      rating: 14.5,
      ratingPossession: 'gold',
    });
    const screen = await render(<BoundAccountGroupedList
      accounts={[account]} expandedGameId="chunithm" activeAccountId={account.id}
      onToggleGame={jest.fn()} onSelectAccount={jest.fn()}
    />);
    const theme = resolveChunithmPossessionTheme('gold');

    expect(screen.getByText('14.50')).toBeTruthy();
    expect(screen.queryByText('RATING 14.50')).toBeNull();
    expect(screen.getByLabelText('Rating 14.50，背景 金领域')).toBeTruthy();
    expect(screen.getByTestId('chunithm-rating-tag').props.colors)
      .toEqual(theme.fillColors.map((color) => processColor(color)));
    expect(screen.getByTestId('chunithm-rating-tag-border').props.colors)
      .toEqual(resolveChunithmRatingTierBorder(14.5).borderColors.map((color) => processColor(color)));
  });
});

describe('BoundAccountGroupedList TUF and Muse Dash metadata', () => {
  it('shows a numeric-only RANKED SCORE tag tinted with the TUF theme', async () => {
    const account = createTufBoundAccount({ playerId: 1, displayName: 'TUF玩家', rankedScore: 15.4321 });
    const screen = await render(<BoundAccountGroupedList
      accounts={[account]} expandedGameId="adofai" activeAccountId={account.id}
      onToggleGame={jest.fn()} onSelectAccount={jest.fn()}
    />);

    expect(screen.getByLabelText('RANKED SCORE 15.43')).toBeTruthy();
    expect(screen.getByText('15.43')).toBeTruthy();
    expect(screen.queryByText('RANKED SCORE')).toBeNull();
    expect(screen.getByTestId('tuf-rating-tag').props.colors)
      .toEqual(TUF_RATING_THEME.borderColors.map((color) => processColor(color)));
    expect(screen.getByTestId('tuf-rating-tag-fill').props.colors)
      .toEqual(TUF_RATING_THEME.fillColors.map((color) => processColor(color)));
  });

  it('shows a numeric-only Rating tag tinted with the Muse Dash theme', async () => {
    const account = createMuseDashBoundAccount({ userId: 'md-1', displayName: '喵斯玩家', rl: 15.4321 });
    const screen = await render(<BoundAccountGroupedList
      accounts={[account]} expandedGameId="musedash" activeAccountId={account.id}
      onToggleGame={jest.fn()} onSelectAccount={jest.fn()}
    />);

    expect(screen.getByLabelText('Rating 15.43')).toBeTruthy();
    expect(screen.getByText('15.43')).toBeTruthy();
    expect(screen.getByTestId('musedash-rating-tag').props.colors)
      .toEqual(MUSE_DASH_RATING_THEME.borderColors.map((color) => processColor(color)));
    expect(screen.getByTestId('musedash-rating-tag-fill').props.colors)
      .toEqual(MUSE_DASH_RATING_THEME.fillColors.map((color) => processColor(color)));
  });

  it('keeps the theme tint when the score is missing', async () => {
    const tuf = createTufBoundAccount({ playerId: 1, displayName: 'TUF玩家' });
    const tufScreen = await render(<BoundAccountGroupedList
      accounts={[tuf]} expandedGameId="adofai" activeAccountId={tuf.id}
      onToggleGame={jest.fn()} onSelectAccount={jest.fn()}
    />);
    expect(tufScreen.getByLabelText('RANKED SCORE —')).toBeTruthy();
    expect(tufScreen.getByText('—')).toBeTruthy();
    expect(tufScreen.getByTestId('tuf-rating-tag').props.colors)
      .toEqual(TUF_RATING_THEME.borderColors.map((color) => processColor(color)));

    const muse = createMuseDashBoundAccount({ userId: 'md-1', displayName: '喵斯玩家' });
    const museScreen = await render(<BoundAccountGroupedList
      accounts={[muse]} expandedGameId="musedash" activeAccountId={muse.id}
      onToggleGame={jest.fn()} onSelectAccount={jest.fn()}
    />);
    expect(museScreen.getByLabelText('Rating —')).toBeTruthy();
    expect(museScreen.getByText('—')).toBeTruthy();
    expect(museScreen.getByTestId('musedash-rating-tag-fill').props.colors)
      .toEqual(MUSE_DASH_RATING_THEME.fillColors.map((color) => processColor(color)));
  });
});
