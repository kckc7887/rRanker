import { render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import OverviewScreen from '../app/(tabs)/(overview)/index';
import { createLocalMaimaiAccount, createMaimaiBoundAccount } from '@/domain/bound-account';
import type { ProviderId } from '@/domain/game-bind-options';

let mockProviderId: ProviderId = 'local';
const mockLocal = createLocalMaimaiAccount('本地玩家', 0);
const mockWater = createMaimaiBoundAccount({
  providerId: 'diving-fish', displayName: '水鱼玩家', rating: 15000, playerId: 'water',
});

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/components/AccountSwitchSheet', () => ({ AccountSwitchSheet: () => null }));
jest.mock('@/components/UploadDataSheet', () => ({ UploadDataSheet: () => null }));
jest.mock('@/components/SourceStatus', () => ({ SourceStatus: () => null }));
jest.mock('@/components/DxRatingCard', () => ({ DxRatingCard: () => null }));
jest.mock('@/components/QueryStateView', () => ({
  QueryStateView: ({ data, renderData }: { data: unknown; renderData: (value: unknown) => unknown }) => (
    renderData(data)
  ),
}));
jest.mock('@/services/refresh-diving-fish-accounts', () => ({
  refreshDivingFishAccounts: jest.fn(),
}));
jest.mock('@/services/invalidate-account-data', () => ({
  invalidateAccountDataQueries: jest.fn(async () => undefined),
}));
jest.mock('@/hooks/use-native-tab-bottom-inset', () => ({ useNativeTabBottomInset: () => 0 }));
jest.mock('@/hooks/use-user-library', () => ({
  useUserLibrary: () => ({ data: [], isError: false }),
}));
jest.mock('@/hooks/use-detailed-catalog', () => ({
  useDetailedCatalog: () => ({ data: undefined, error: null, refetch: jest.fn() }),
}));
jest.mock('@/hooks/use-game-data', () => ({
  useGameData: () => ({
    data: {
      gameId: 'maimai',
      providerId: mockProviderId,
      profile: {
        title: '舞萌 DX', ratingLabel: 'DX RATING', ratingDigits: 5,
        bestSections: [{ id: 'b35', title: 'B35' }, { id: 'b15', title: 'B15' }],
      },
      payload: {
        kind: 'maimai',
        player: { displayName: mockProviderId === 'local' ? '本地玩家' : '水鱼玩家' },
        records: [],
        bestSections: [{ id: 'b35', title: 'B35', records: [] }, { id: 'b15', title: 'B15', records: [] }],
        playerScore: { label: 'DX RATING', value: 0, display: '00000' },
        currentVersionTitle: '当前版本',
        source: { kind: 'local', label: '成绩', updatedAt: '2026-07-17T00:00:00.000Z', isStale: false },
        catalogSource: { kind: 'lxns', label: '曲库', updatedAt: '2026-07-17T00:00:00.000Z', isStale: false },
      },
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
    profile: { ratingLabel: 'DX RATING', ratingDigits: 5 },
  }),
}));
jest.mock('@/state/session-store', () => ({
  applyLxnsTokenRotation: jest.fn(),
  useSession: (selector: (state: unknown) => unknown) => selector({
    boundAccounts: [mockLocal, mockWater],
    activeAccountId: mockProviderId === 'local' ? mockLocal.id : mockWater.id,
    session: mockProviderId === 'local'
      ? null
      : { mode: 'import-token', value: 'token', persistable: true },
    sessionsByAccountId: {},
    selectBoundAccount: jest.fn(),
    updateBoundAccountScore: jest.fn(),
  }),
}));
jest.mock('@/state/game-picker-ui', () => ({
  useGamePickerUi: (selector: (state: unknown) => unknown) => selector({
    expandedGameId: 'maimai',
    setExpandedGameId: jest.fn(),
    toggleExpandedGameId: jest.fn(),
  }),
}));
jest.mock('@/state/query-client', () => ({
  queryClient: { cancelQueries: jest.fn(), invalidateQueries: jest.fn() },
}));
jest.mock('@/storage/secure-session-store', () => ({
  SecureSessionStore: jest.fn(() => ({ setActiveAccountId: jest.fn() })),
}));

describe('总览上传和同步操作', () => {
  it('本地查分器页只显示使用好友码的同步按钮', async () => {
    mockProviderId = 'local';
    const screen = await render(<OverviewScreen />);
    expect(screen.getByLabelText('同步本地查分器数据，使用好友码')).toBeTruthy();
    expect(screen.queryByText('上传数据')).toBeNull();
  });

  it('其他舞萌查分器页仍显示上传与同步双按钮', async () => {
    mockProviderId = 'diving-fish';
    const screen = await render(<OverviewScreen />);
    expect(screen.getByText('上传数据')).toBeTruthy();
    expect(screen.getByLabelText('同步数据，当前 水鱼查分器')).toBeTruthy();
  });
});
