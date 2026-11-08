import { setDisabledPlugins } from '@rranker/sdk';
import { render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import type { ReactNode } from 'react';
import { OverviewScreen } from '../app/(tabs)/(overview)/index';
import { createMuseDashBoundAccount } from '@rranker/game-musedash/accounts';

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

    };
  },
  payload: {
    kind: 'musedash', player: mockPlayer,
    playerScore: { label: 'Rating', value: 3.4518686005869577, display: '3.45' },
    source: { kind: 'musedash', label: 'MuseDash.moe', updatedAt: '2026-08-10T00:00:00.000Z', isStale: false },
  },
};

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@rranker/sdk/components/AppNotification', () => ({
  useNotification: () => ({ showNotification: jest.fn(), showActionNotification: jest.fn() }),
}));
jest.mock('@rranker/sdk/components/AccountSwitchSheet', () => ({ AccountSwitchSheet: () => null }));
jest.mock('@rranker/tool-maimai/components/UploadDataSheet', () => ({ UploadDataSheet: () => null }));
jest.mock('@rranker/game-maimai/components/MaimaiUploadTabs', () => ({ MaimaiUploadTabs: () => null }));
jest.mock('@rranker/tool-maimai/components/MaimaiSyncGuideSheet', () => ({ MaimaiSyncGuideContent: () => null }));
jest.mock('@rranker/tool-chunithm/components/ChunithmSyncGuideSheet', () => ({ ChunithmSyncGuideSheet: () => null }));
jest.mock('@rranker/game-maimai/hooks/use-dxrating-chart-tags', () => ({ useDxRatingChartTags: () => ({ data: undefined, error: null }) }));
jest.mock('@rranker/game-phigros/hooks/use-phigros-kyou', () => ({ usePhigrosKyouChartTags: () => ({ data: undefined, error: null }) }));
jest.mock('@rranker/game-maimai/hooks/use-plates', () => ({ usePlates: () => ({ data: undefined, error: null }) }));
jest.mock('@rranker/game-musedash/hooks/use-muse-dash', () => ({ useMuseDashAlbums: () => ({ data: undefined, source: undefined, error: null }) }));
jest.mock('@rranker/game-chunithm/hooks/use-chunithm-collections', () => ({ useChunithmCollections: () => ({ data: undefined, error: null }) }));
jest.mock('@rranker/sdk/components/RatingCard', () => ({ RatingCard: () => null }));
jest.mock('@rranker/sdk/components/QueryStateView', () => ({
  QueryStateView: ({ data, isEmpty, emptyText, renderData }: {
    data: unknown; isEmpty: boolean; emptyText?: string; renderData: (value: unknown) => ReactNode;
  }) => {
    const RN = jest.requireActual<typeof import('react-native')>('react-native');
    return isEmpty && !data ? <RN.Text>{emptyText}</RN.Text> : renderData(data);
  },
}));
jest.mock('@rranker/sdk/hooks/use-game-data', () => ({ useGameData: () => ({
  data: mockBundle, isLoading: false, isError: false, error: null, refetch: jest.fn(),
  profile: { ratingLabel: 'Rating', ratingDigits: 0 },
}) }));
jest.mock('@rranker/sdk/hooks/use-native-tab-bottom-inset', () => ({ useNativeTabBottomInset: () => 0 }));
jest.mock('@rranker/sdk/hooks/use-user-library', () => ({ useUserLibrary: () => ({ data: [], isError: false }) }));
jest.mock('@rranker/game-maimai/hooks/use-detailed-catalog', () => ({ useDetailedCatalog: () => ({
  data: undefined, error: null, refetch: jest.fn(async () => ({ data: undefined })),
}) }));
jest.mock('@rranker/game-chunithm/hooks/use-chunithm-catalog', () => ({ useChunithmCatalog: () => ({
  data: undefined, isLoading: false, isError: false,
}) }));
jest.mock('@rranker/sdk/state/session-store', () => ({
  applyLxnsTokenRotation: jest.fn(),
  useSession: (selector: (state: unknown) => unknown) => selector({
    boundAccounts: [mockAccount], activeGameId: 'musedash', activeAccountId: mockAccount.id,
    session: null, sessionsByAccountId: {}, updateBoundAccountScore: jest.fn(),
  }),
}));
jest.mock('@rranker/sdk/state/toolbox-pins', () => ({ useToolboxPins: (selector: (state: unknown) => unknown) => selector({
  pinsByGame: { maimai: [], chunithm: [], phigros: [], adofai: [], musedash: [], test: [] },


  hydrate: jest.fn(async () => undefined),
}) }));
jest.mock('@rranker/sdk/state/game-picker-ui', () => ({ useGamePickerUi: (selector: (state: unknown) => unknown) => selector({
  expandedGameId: 'musedash', setExpandedGameId: jest.fn(), toggleExpandedGameId: jest.fn(),
}) }));
jest.mock('@rranker/sdk/state/query-client', () => ({ queryClient: {
  cancelQueries: jest.fn(async () => undefined), invalidateQueries: jest.fn(async () => undefined), getQueryData: jest.fn(),
} }));
jest.mock('@rranker/sdk/services/invalidate-account-data', () => ({ invalidateAccountDataQueries: jest.fn(async () => undefined) }));
jest.mock('@rranker/sdk/services/switch-bound-account', () => ({ switchBoundAccount: jest.fn() }));
jest.mock('@rranker/tool-maimai/services/refresh-diving-fish-accounts', () => ({ refreshDivingFishAccounts: jest.fn() }));
jest.mock('@rranker/game-maimai/domain/maimai-maintenance', () => ({
  MAIMAI_MAINTENANCE_MESSAGE: '维护', isMaimaiMaintenanceWindow: () => false,
}));
jest.mock('@rranker/game-chunithm/domain/chunithm-maintenance', () => ({
  CHUNITHM_MAINTENANCE_MESSAGE: '维护', isChunithmMaintenanceWindow: () => false,
}));

describe('overview capability contract', () => {
  beforeEach(() => { setDisabledPlugins([]); });
  afterEach(() => { setDisabledPlugins([]); });

  it('shows the toolbox entry only while a contributing tool is available', async () => {
    const withTools = await render(<OverviewScreen />);
    expect(withTools.getByText('工具箱')).toBeTruthy();
    expect(withTools.getByText('打开工具箱 →')).toBeTruthy();
    expect(withTools.getByText('随机歌曲 · 音游地图')).toBeTruthy();
    await withTools.unmount();

    setDisabledPlugins(['tool.musedash', 'tool.arcade-finder']);
    const withoutTools = await render(<OverviewScreen />);
    expect(withoutTools.queryByText('工具箱')).toBeNull();
    expect(withoutTools.queryByText('打开工具箱 →')).toBeNull();
    await withoutTools.unmount();
  });
});
