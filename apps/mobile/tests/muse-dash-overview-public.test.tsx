import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import type { ReactNode } from 'react';
import { OverviewScreen } from '../app/(tabs)/(overview)/index';
import { createMuseDashBoundAccount } from '@/domain/bound-account';

const mockRefetch = jest.fn<() => Promise<{ data: unknown }>>();
const mockSwitchBoundAccount = jest.fn();
let mockNullPayload = false;
const mockFirstAccount = createMuseDashBoundAccount({
  userId: '6ea4f986ffd211e8aa980242ac110011', displayName: 'SiMOOOOOON', rl: 3.45,
});
const mockSecondAccount = createMuseDashBoundAccount({
  userId: 'aabbccddffd211e8aa980242ac110011', displayName: '二号玩家', rl: 4.2,
});
const mockPlayer = {
  lastUpdate: 1786311369798, rl: 3.4518686005869577, diffHistoryNumber: 11,
  plays: [
    { score: 302027, acc: 94.17, i: 1950, platform: 'mobile', history: { lastRank: 1949 }, difficulty: 2, uid: '1-1', sum: 3950, character_uid: '11', elfin_uid: '7' },
  ],
  user: { user_id: '6ea4f986ffd211e8aa980242ac110011', nickname: 'SiMOOOOOON' },
};
const mockBundle = {
  gameId: 'musedash', providerId: 'musedash-moe',
  profile: {
    id: 'musedash', title: '喵斯快跑', ratingLabel: 'Rating', ratingDigits: 0,
    bestSections: [{ id: 'best30', title: 'Best 30', size: 30 }],
    capabilities: { hasCatalog: true, hasRecords: true, hasBestList: true, hasTools: false },
  },
  payload: {
    kind: 'musedash', player: mockPlayer,
    playerScore: { label: 'Rating', value: 3.4518686005869577, display: '3.45' },
    source: { kind: 'musedash', label: 'MuseDash.moe', updatedAt: '2026-08-10T00:00:00.000Z', isStale: false },
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
      <RN.Pressable accessibilityLabel="选择喵斯二号" onPress={() => onSelectAccount(accounts[1])} />
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
  profile: { ratingLabel: 'Rating', ratingDigits: 0 },
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
    boundAccounts: [mockFirstAccount, mockSecondAccount], activeGameId: 'musedash', activeAccountId: mockFirstAccount.id,
    session: null, sessionsByAccountId: {}, updateBoundAccountScore: jest.fn(),
  }),
}));
jest.mock('@/state/toolbox-pins', () => ({ useToolboxPins: (selector: (state: unknown) => unknown) => selector({
  pinnedToolIdsByGame: { maimai: [], chunithm: [], phigros: [], adofai: [], musedash: [], test: [] },
  pinnedPlateIdsByGame: { maimai: [], chunithm: [], phigros: [], adofai: [], musedash: [], test: [] },
  pinnedCollectionIdsByGame: { maimai: [], chunithm: [], phigros: [], adofai: [], musedash: [], test: [] },
  hydrate: jest.fn(async () => undefined),
}) }));
jest.mock('@/state/game-picker-ui', () => ({ useGamePickerUi: (selector: (state: unknown) => unknown) => selector({
  expandedGameId: 'musedash', setExpandedGameId: jest.fn(), toggleExpandedGameId: jest.fn(),
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

describe('Muse Dash public overview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNullPayload = false;
    mockRefetch.mockResolvedValue({ data: mockBundle });
  });

  it('keeps the public overview shell, account switching, sync and Muse Dash profile slot', async () => {
    const screen = await render(<OverviewScreen />);
    expect(screen.getByTestId('overview-scroll')).toBeTruthy();
    expect(screen.getByText('喵斯快跑 · 玩家概览')).toBeTruthy();
    expect(screen.getByText(/Rating 3.45/)).toBeTruthy();
    expect(screen.getByText(/谱面 1 首/)).toBeTruthy();
    expect(screen.queryByText('公开资料')).toBeNull();
    expect(screen.getAllByText('MuseDash.moe').length).toBeGreaterThan(0);
    expect(screen.getByText('我的曲库')).toBeTruthy();
    expect(screen.getByText('收藏 0 首 · 练习 0 张')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('当前玩家 SiMOOOOOON，点击切换账号'));
    expect(screen.getByText('账号切换已打开')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('选择喵斯二号'));
    expect(mockSwitchBoundAccount).toHaveBeenCalledWith(mockSecondAccount.id, { navigateToOverview: false });

    await fireEvent.press(screen.getByLabelText('同步数据，当前 MuseDash.moe'));
    await waitFor(() => expect(mockRefetch).toHaveBeenCalledTimes(1));
    expect(screen.getByText('来源：MuseDash.moe')).toBeTruthy();
    expect(screen.queryByText(/读取方式/)).toBeNull();
  });

  it('rejects a stale null payload before the public shell reads player fields', async () => {
    mockNullPayload = true;
    const screen = await render(<OverviewScreen />);
    expect(screen.getByText('请在游戏管理中绑定喵斯快跑玩家')).toBeTruthy();
    expect(screen.queryByTestId('overview-scroll')).toBeNull();
  });
});
