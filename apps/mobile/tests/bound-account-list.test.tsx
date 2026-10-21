import { jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { AccountSwitchSheet } from '@/components/AccountSwitchSheet';
import { BoundAccountGroupedList } from '@/components/BoundAccountGroupedList';
import {
  createChunithmBoundAccount,
  createMuseDashBoundAccount,
  createPhigrosBoundAccount,
  createTufBoundAccount,
} from '@/domain/bound-account';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
jest.mock('@/services/hydrate-bound-account-avatars', () => ({ hydrateBoundAccountAvatars: jest.fn(async () => undefined) }));
jest.mock('@/services/account-thumbnail', () => ({ hydrateAccountDisplayData: jest.fn(async () => undefined) }));
jest.mock('@/services/hydrate-chunithm-account-summaries', () => ({ hydrateChunithmAccountSummaries: jest.fn(async () => undefined) }));
jest.mock('@/services/hydrate-phigros-account-summaries', () => ({ hydratePhigrosAccountSummaries: jest.fn(async () => undefined) }));
jest.mock('@/components/BoundAccountAvatar', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return { BoundAccountAvatar: () => <RN.View /> };
});

describe('BoundAccountGroupedList Phigros metadata', () => {
  it('shows the Phigros account RKS and active state', async () => {
    const account = createPhigrosBoundAccount({ playerId: 'PhiPlayer', rating: 15.4321, challengeModeRank: 523 });
    const screen = await render(<BoundAccountGroupedList
      accounts={[account]} expandedGameId="phigros" activeAccountId={account.id}
      onToggleGame={jest.fn()} onSelectAccount={jest.fn()}
    />);

    expect(screen.getByLabelText('RKS 15.43')).toBeTruthy();
    expect(screen.getByText('15.43')).toBeTruthy();
    expect(screen.queryByText('RKS')).toBeNull();
    expect(screen.queryByText('课题模式')).toBeNull();
    expect(screen.getByText('当前')).toBeTruthy();
    expect(screen.getByText('TapTap 云存档')).toBeTruthy();
  });
});

describe('BoundAccountGroupedList Chunithm metadata', () => {
  it('shows the Chunithm account Rating', async () => {
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

    expect(screen.getByText('14.50')).toBeTruthy();
    expect(screen.queryByText('RATING 14.50')).toBeNull();
    expect(screen.getByLabelText('Rating 14.50，背景 金领域')).toBeTruthy();
  });
});

describe('BoundAccountGroupedList TUF and Muse Dash metadata', () => {
  it('shows the TUF account ranked score', async () => {
    const account = createTufBoundAccount({ playerId: 1, displayName: 'TUF玩家', rankedScore: 15.4321 });
    const screen = await render(<BoundAccountGroupedList
      accounts={[account]} expandedGameId="adofai" activeAccountId={account.id}
      onToggleGame={jest.fn()} onSelectAccount={jest.fn()}
    />);

    expect(screen.getByLabelText('RANKED SCORE 15.43')).toBeTruthy();
    expect(screen.getByText('15.43')).toBeTruthy();
    expect(screen.queryByText('RANKED SCORE')).toBeNull();
  });

  it('shows the Muse Dash account Rating', async () => {
    const account = createMuseDashBoundAccount({ userId: 'md-1', displayName: '喵斯玩家', rl: 15.4321 });
    const screen = await render(<BoundAccountGroupedList
      accounts={[account]} expandedGameId="musedash" activeAccountId={account.id}
      onToggleGame={jest.fn()} onSelectAccount={jest.fn()}
    />);

    expect(screen.getByLabelText('Rating 15.43')).toBeTruthy();
    expect(screen.getByText('15.43')).toBeTruthy();
  });

  it('shows a placeholder when the account score is missing', async () => {
    const tuf = createTufBoundAccount({ playerId: 1, displayName: 'TUF玩家' });
    const tufScreen = await render(<BoundAccountGroupedList
      accounts={[tuf]} expandedGameId="adofai" activeAccountId={tuf.id}
      onToggleGame={jest.fn()} onSelectAccount={jest.fn()}
    />);
    expect(tufScreen.getByLabelText('RANKED SCORE —')).toBeTruthy();
    expect(tufScreen.getByText('—')).toBeTruthy();

    const muse = createMuseDashBoundAccount({ userId: 'md-1', displayName: '喵斯玩家' });
    const museScreen = await render(<BoundAccountGroupedList
      accounts={[muse]} expandedGameId="musedash" activeAccountId={muse.id}
      onToggleGame={jest.fn()} onSelectAccount={jest.fn()}
    />);
    expect(museScreen.getByLabelText('Rating —')).toBeTruthy();
    expect(museScreen.getByText('—')).toBeTruthy();
  });
});


it('selects an account from the switch sheet, renders its supplied score and closes on completion', async () => {
  const account = createTufBoundAccount({ playerId: 1, displayName: '切换玩家', rankedScore: 15000 });
  const onSelectAccount = jest.fn();
  const onClose = jest.fn();
  const screen = await render(<AccountSwitchSheet visible accounts={[account]} expandedGameId="adofai"
    activeAccountId={null} onToggleGame={jest.fn()} onSelectAccount={onSelectAccount} onClose={onClose}
    renderRatingTag={() => <Text>15000 分</Text>} />);
  expect(screen.getByText('15000 分')).toBeTruthy();
  await fireEvent.press(screen.getByText('切换玩家'));
  expect(onSelectAccount).toHaveBeenCalledWith(account);
  await fireEvent.press(screen.getByText('完成'));
  expect(onClose).toHaveBeenCalled();
});
