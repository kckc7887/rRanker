import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import type { ReactNode } from 'react';
import { OverviewScreen } from '../app/(tabs)/(overview)/index';
import { createTufBoundAccount } from '@/domain/bound-account';

const mockRefetch = jest.fn<() => Promise<{ data: unknown }>>();
const mockSwitchBoundAccount = jest.fn();
let mockNullPayload = false;
const mockFirstAccount = createTufBoundAccount({ playerId: 25, displayName: '公开玩家', rankedScore: 1824.52 });
const mockSecondAccount = createTufBoundAccount({ playerId: 26, displayName: '公开二号', rankedScore: 1600 });
const mockPlayer = {
  id: 25, name: '公开玩家', rankedScore: 1824.52, generalScore: 1900, ppScore: 300,
  averageXacc: 99.8, totalPasses: 20, universalPassCount: 10, worldFirstCount: 2,
  globalRank: 12, topDiff: 'G12', topScores: [],
};
const mockBundle = {
  gameId: 'adofai', providerId: 'tuf',
  profile: {
    id: 'adofai', title: '冰与火之舞', ratingLabel: 'RANKED SCORE', ratingDigits: 0,
    bestSections: [{ id: 'top20', title: 'Top 20 Impact', size: 20 }],
    capabilities: { hasCatalog: true, hasRecords: true, hasBestList: true, hasTools: false },
  },
  payload: {
    kind: 'adofai', player: mockPlayer,
    playerScore: { label: 'RANKED SCORE', value: 1824.52, display: '1824.52' },
    source: { kind: 'tuf', label: 'TUF 社区公开数据', updatedAt: '2026-08-10T00:00:00.000Z', isStale: false },
  },
} as const;

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/components/AppNotification', () => ({
  useNotification: () => ({ showNotification: jest.fn(), showActionNotification: jest.fn() }),
}));
jest.mock('@/components/AccountSwitchSheet', () => ({
  AccountSwitchSheet: ({
    visible, accounts, onSelectAccount,
  }: {
    visible: boolean;
    accounts: typeof mockFirstAccount[];
    onSelectAccount: (account: typeof mockFirstAccount) => void;
  }) => {
    const RN = jest.requireActual<typeof import('react-native')>('react-native');
    return visible ? <>
      <RN.Text>账号切换已打开</RN.Text>
      <RN.Pressable accessibilityLabel="选择 TUF 二号" onPress={() => onSelectAccount(accounts[1])} />
    </> : null;
  },
}));
jest.mock('@/components/UploadDataSheet', () => ({ UploadDataSheet: () => null }));
jest.mock('@/components/maimai/MaimaiUploadTabs', () => ({ MaimaiUploadTabs: () => null }));
jest.mock('@/components/maimai/MaimaiSyncGuideSheet', () => ({ MaimaiSyncGuideContent: () => null }));
jest.mock('@/components/chunithm/ChunithmSyncGuideSheet', () => ({ ChunithmSyncGuideSheet: () => null }));
jest.mock('@/components/SourceStatus', () => ({
  SourceStatus: ({ items }: { items: { label: string }[] }) => {
    const RN = jest.requireActual<typeof import('react-native')>('react-native');
    return <RN.Text>{items.map((item) => item.label).join(' · ')}</RN.Text>;
  },
}));
jest.mock('@/components/DxRatingCard', () => ({
  DxRatingCard: ({ label, display, meta, sideBadge }: {
    label: string; display: string; meta: string; sideBadge?: { title: string; value: string };
  }) => {
    const RN = jest.requireActual<typeof import('react-native')>('react-native');
    return <RN.Text>{`${label} ${display} · ${meta} · ${sideBadge?.title} ${sideBadge?.value}`}</RN.Text>;
  },
}));
jest.mock('@/components/QueryStateView', () => ({
  QueryStateView: ({ data, isEmpty, emptyText, renderData }: {
    data: unknown; isEmpty: boolean; emptyText?: string; renderData: (value: unknown) => ReactNode;
  }) => {
    const RN = jest.requireActual<typeof import('react-native')>('react-native');
    return isEmpty && !data ? <RN.Text>{emptyText}</RN.Text> : renderData(data);
  },
}));
jest.mock('@/hooks/use-game-data', () => ({ useGameData: () => ({
  data: mockNullPayload ? { ...mockBundle, payload: null } : mockBundle,
  isLoading: false, isError: false, error: null, refetch: mockRefetch,
  profile: { ratingLabel: 'RANKED SCORE', ratingDigits: 0 },
}) }));
jest.mock('@/hooks/use-native-tab-bottom-inset', () => ({ useNativeTabBottomInset: () => 0 }));
jest.mock('@/hooks/use-user-library', () => ({ useUserLibrary: () => ({ data: [], isError: false }) }));
jest.mock('@/hooks/use-detailed-catalog', () => ({ useDetailedCatalog: () => ({
  data: undefined, error: null, refetch: jest.fn(async () => ({ data: undefined })),
}) }));
jest.mock('@/hooks/use-chunithm-catalog', () => ({ useChunithmCatalog: () => ({
  data: undefined, isLoading: false, isError: false,
}) }));
jest.mock('@/state/session-store', () => ({
  applyLxnsTokenRotation: jest.fn(),
  useSession: (selector: (state: unknown) => unknown) => selector({
    boundAccounts: [mockFirstAccount, mockSecondAccount], activeGameId: 'adofai', activeAccountId: mockFirstAccount.id,
    session: null, sessionsByAccountId: {}, updateBoundAccountScore: jest.fn(),
  }),
}));
jest.mock('@/state/toolbox-pins', () => ({ useToolboxPins: (selector: (state: unknown) => unknown) => selector({
  pinnedToolIdsByGame: { maimai: [], chunithm: [], phigros: [], adofai: [], test: [] },
  pinnedPlateIdsByGame: { maimai: [], chunithm: [], phigros: [], adofai: [], test: [] },
  pinnedCollectionIdsByGame: { maimai: [], chunithm: [], phigros: [], adofai: [], test: [] },
  hydrate: jest.fn(async () => undefined),
}) }));
jest.mock('@/state/game-picker-ui', () => ({ useGamePickerUi: (selector: (state: unknown) => unknown) => selector({
  expandedGameId: 'adofai', setExpandedGameId: jest.fn(), toggleExpandedGameId: jest.fn(),
}) }));
jest.mock('@/state/query-client', () => ({ queryClient: {
  cancelQueries: jest.fn(async () => undefined), invalidateQueries: jest.fn(async () => undefined), getQueryData: jest.fn(),
} }));
jest.mock('@/services/invalidate-account-data', () => ({ invalidateAccountDataQueries: jest.fn(async () => undefined) }));
jest.mock('@/services/switch-bound-account', () => ({ switchBoundAccount: (...args: unknown[]) => mockSwitchBoundAccount(...args) }));
jest.mock('@/services/refresh-diving-fish-accounts', () => ({ refreshDivingFishAccounts: jest.fn() }));
jest.mock('@/domain/maimai-maintenance', () => ({
  MAIMAI_MAINTENANCE_MESSAGE: '维护', isMaimaiMaintenanceWindow: () => false,
}));
jest.mock('@/domain/chunithm-maintenance', () => ({
  CHUNITHM_MAINTENANCE_MESSAGE: '维护', isChunithmMaintenanceWindow: () => false,
}));

describe('TUF public overview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNullPayload = false;
    mockRefetch.mockResolvedValue({ data: mockBundle });
  });

  it('keeps the public overview shell, account switching, sync and TUF profile slot', async () => {
    const screen = await render(<OverviewScreen />);
    expect(screen.getByTestId('overview-scroll')).toBeTruthy();
    expect(screen.getByText('冰与火之舞 · 玩家概览')).toBeTruthy();
    expect(screen.getByText(/RANKED SCORE 1824.52/)).toBeTruthy();
    expect(screen.getByText(/世界排名 #12/)).toBeTruthy();
    expect(screen.getByText(/世界排名 #12$/)).toBeTruthy();
    expect(screen.queryByText(/TUF PLAYER/)).toBeNull();
    expect(screen.getByText('公开资料')).toBeTruthy();
    expect(screen.getByText('99.80%')).toBeTruthy();
    expect(screen.getByText('TUF 社区公开数据')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('当前玩家 公开玩家，点击切换账号'));
    expect(screen.getByText('账号切换已打开')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('选择 TUF 二号'));
    expect(mockSwitchBoundAccount).toHaveBeenCalledWith(mockSecondAccount.id, { navigateToOverview: false });

    await fireEvent.press(screen.getByLabelText('同步数据，当前 TUF 社区'));
    await waitFor(() => expect(mockRefetch).toHaveBeenCalledTimes(1));
    expect(screen.getByText('读取方式：TUF 公开接口按需读取')).toBeTruthy();
  });

  it('rejects a stale null payload before the public shell reads player fields', async () => {
    mockNullPayload = true;
    const screen = await render(<OverviewScreen />);
    expect(screen.getByText('请在游戏管理中绑定 TUF 玩家')).toBeTruthy();
    expect(screen.queryByTestId('overview-scroll')).toBeNull();
  });
});
