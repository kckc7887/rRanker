import { render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { BoundAccountGroupedList } from '@/components/BoundAccountGroupedList';
import { createPhigrosBoundAccount } from '@/domain/bound-account';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/services/hydrate-bound-account-avatars', () => ({ hydrateBoundAccountAvatars: jest.fn(async () => undefined) }));
jest.mock('@/services/hydrate-phigros-account-summaries', () => ({ hydratePhigrosAccountSummaries: jest.fn(async () => undefined) }));
jest.mock('@/components/BoundAccountAvatar', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return { BoundAccountAvatar: () => <RN.View /> };
});

describe('BoundAccountGroupedList Phigros metadata', () => {
  it('shows four-decimal RKS and challenge tags in the shared account card', async () => {
    const account = createPhigrosBoundAccount({ playerId: 'PhiPlayer', rating: 15.4321, challengeModeRank: 523 });
    const screen = await render(<BoundAccountGroupedList
      accounts={[account]} expandedGameId="phigros" activeAccountId={account.id}
      onToggleGame={jest.fn()} onSelectAccount={jest.fn()}
    />);
    expect(screen.getByLabelText('RKS 15.4321')).toBeTruthy();
    expect(screen.getByLabelText('课题模式 23')).toBeTruthy();
    expect(screen.getByText('当前')).toBeTruthy();
    expect(screen.getByText('TapTap 云存档')).toBeTruthy();
  });
});
