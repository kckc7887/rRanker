import { render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import type { ReactNode } from 'react';
import { OverviewScreen } from '../app/(tabs)/(overview)/index';
import { createMuseDashBoundAccount } from '@/domain/bound-account';

let mockHasTools = true;
const mockAccount = createMuseDashBoundAccount({
  userId: '6ea4f986ffd211e8aa980242ac110011', displayName: 'SiMOOOOOON', rl: 3.45,
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
  get profile() {
    return {
      id: 'musedash', title: '喵斯快跑', ratingLabel: 'Rating', ratingDigits: 0,
      bestSections: [{ id: 'best30', title: 'Best 30', size: 30 }],
      capabilities: { hasTools: mockHasTools },
    };
  },
  payload: {
    kind: 'musedash', player: mockPlayer,
    playerScore: { label: 'Rating', value: 3.4518686005869577, display: '3.45' },
    source: { kind: 'musedash', label: 'MuseDash.moe', updatedAt: '2026-08-10T00:00:00.000Z', isStale: false },
  },
};

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/components/AppNotification', () => ({
  useNotification: () => ({ showNotification: jest.fn(), showActionNotification: jest.fn() }),
}));
jest.mock('@/components/AccountSwitchSheet', () => ({ AccountSwitchSheet: () => null }));
jest.mock('@/components/UploadDataSheet', () => ({ UploadDataSheet: () => null }));
jest.mock('@/components/maimai/MaimaiUploadTabs', () => ({ MaimaiUploadTabs: () => null }));
jest.mock('@/components/maimai/MaimaiSyncGuideSheet', () => ({ MaimaiSyncGuideContent: () => null }));
jest.mock('@/components/chunithm/ChunithmSyncGuideSheet', () => ({ ChunithmSyncGuideSheet: () => null }));
jest.mock('@/hooks/use-dxrating-chart-tags', () => ({ useDxRatingChartTags: () => ({ data: undefined, error: null }) }));
jest.mock('@/hooks/use-phigros-kyou', () => ({ usePhigrosKyouChartTags: () => ({ data: undefined, error: null }) }));
jest.mock('@/hooks/use-plates', () => ({ usePlates: () => ({ data: undefined, error: null }) }));
jest.mock('@/hooks/use-muse-dash', () => ({ useMuseDashAlbums: () => ({ data: undefined, source: undefined, error: null }) }));
jest.mock('@/hooks/use-chunithm-collections', () => ({ useChunithmCollections: () => ({ data: undefined, error: null }) }));
jest.mock('@/components/DxRatingCard', () => ({ DxRatingCard: () => null }));
jest.mock('@/components/QueryStateView', () => ({
  QueryStateView: ({ data, isEmpty, emptyText, renderData }: {
    data: unknown; isEmpty: boolean; emptyText?: string; renderData: (value: unknown) => ReactNode;
  }) => {
    const RN = jest.requireActual<typeof import('react-native')>('react-native');
    return isEmpty && !data ? <RN.Text>{emptyText}</RN.Text> : renderData(data);
  },
}));
jest.mock('@/hooks/use-game-data', () => ({ useGameData: () => ({
  data: mockBundle, isLoading: false, isError: false, error: null, refetch: jest.fn(),
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
    boundAccounts: [mockAccount], activeGameId: 'musedash', activeAccountId: mockAccount.id,
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
jest.mock('@/services/switch-bound-account', () => ({ switchBoundAccount: jest.fn() }));
jest.mock('@/services/refresh-diving-fish-accounts', () => ({ refreshDivingFishAccounts: jest.fn() }));
jest.mock('@/domain/maimai-maintenance', () => ({
  MAIMAI_MAINTENANCE_MESSAGE: '维护', isMaimaiMaintenanceWindow: () => false,
}));
jest.mock('@/domain/chunithm-maintenance', () => ({
  CHUNITHM_MAINTENANCE_MESSAGE: '维护', isChunithmMaintenanceWindow: () => false,
}));

describe('overview capability contract', () => {
  beforeEach(() => { mockHasTools = true; });

  it('shows the toolbox entry only while the profile declares tools', async () => {
    const withTools = await render(<OverviewScreen />);
    expect(withTools.getByText('工具箱')).toBeTruthy();
    expect(withTools.getByText('打开工具箱 →')).toBeTruthy();
    expect(withTools.getByText('随机歌曲 · 机厅查找')).toBeTruthy();
    await withTools.unmount();

    mockHasTools = false;
    const withoutTools = await render(<OverviewScreen />);
    expect(withoutTools.queryByText('工具箱')).toBeNull();
    expect(withoutTools.queryByText('打开工具箱 →')).toBeNull();
    await withoutTools.unmount();
  });
});
