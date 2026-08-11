import { render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { processColor } from 'react-native';
import { BoundAccountGroupedList } from '@/components/BoundAccountGroupedList';
import {
  createChunithmBoundAccount,
  createPhigrosBoundAccount,
} from '@/domain/bound-account';
import { resolveChunithmPossessionTheme } from '@/domain/chunithm-rating-theme';

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
  it('shows a two-decimal numeric-only RKS tag and the existing challenge tag', async () => {
    const account = createPhigrosBoundAccount({ playerId: 'PhiPlayer', rating: 15.4321, challengeModeRank: 523 });
    const screen = await render(<BoundAccountGroupedList
      accounts={[account]} expandedGameId="phigros" activeAccountId={account.id}
      onToggleGame={jest.fn()} onSelectAccount={jest.fn()}
    />);
    expect(screen.getByLabelText('RKS 15.43')).toBeTruthy();
    expect(screen.getByText('15.43')).toBeTruthy();
    expect(screen.queryByText('RKS')).toBeNull();
    expect(screen.getByLabelText('课题模式 23')).toBeTruthy();
    expect(screen.getByText('当前')).toBeTruthy();
    expect(screen.getByText('TapTap 云存档')).toBeTruthy();
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
  });
});
