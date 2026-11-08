import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { OverviewScreen } from '../app/(tabs)/(overview)/index';
import ToolsScreen from '../app/tools/index';
import { createRizlineBoundAccount } from '@rranker/game-rizline/accounts';
import { rizlinePayloadFromSnapshot } from '@rranker/game-rizline/domain/game-data';
import { getGameProfile } from '@rranker/sdk/domain/game-profile';
import { rizlineCatalog, rizlineChart, rizlineSave } from './fixtures/rizline';

const mockAccount = createRizlineBoundAccount({ userId: 'user-a', username: 'Rizline 玩家', totalRks: 136.123456 });
const mockPush = jest.fn(); const mockShowNotification = jest.fn();
let mockSyncOrder: string[] = [];
let mockBundle = createBundle();
const mockRefetch = jest.fn(async () => { mockSyncOrder.push('scores'); return { data: mockBundle, isError: false }; });
const mockRefreshCatalog = jest.fn(async () => { mockSyncOrder.push('catalog'); });

function createBundle(unknown = false, requiresLogin = false) {
  const catalog = rizlineCatalog();
  catalog.songs[0].charts.push(rizlineChart({ id: 'chart.Song.A.0.HD', difficulty: 'HD' }));
  const save = rizlineSave({ username: 'Rizline 玩家', totalRks: 136.123456 });
  save.myBest.push({ trackAssetId: 'track.Song.A.0', difficultyClassName: 'HD', score: 600000, completeRate: 70 });
  save.levelsRks.push({ trackId: 'track.Song.A.0', difficultyClassName: 'HD', rks: 88.8888 });
  const source = { kind: 'rizline-official' as const, label: '官方账号', updatedAt: '2026-09-13', isStale: requiresLogin };
  return { gameId: 'rizline' as const, providerId: 'rizline-official' as const, profile: getGameProfile('rizline'),
    payload: rizlinePayloadFromSnapshot({ save, source, requiresLogin }, unknown ? undefined : { snapshot: catalog, source }) };
}

jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, router: { push: (...args: unknown[]) => mockPush(...args) } }));
jest.mock('@rranker/sdk/components/AppNotification', () => ({ useNotification: () => ({ showNotification: mockShowNotification, showActionNotification: jest.fn() }) }));
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
jest.mock('@rranker/sdk/hooks/use-game-data', () => ({ useGameData: () => ({ activeGameId: 'rizline', activeAccountId: mockAccount.id, data: mockBundle, isLoading: false, isError: false, error: null, refetch: mockRefetch, profile: mockBundle.profile }) }));
jest.mock('@rranker/sdk/hooks/use-native-tab-bottom-inset', () => ({ useNativeTabBottomInset: () => 0 }));
jest.mock('@rranker/sdk/hooks/use-user-library', () => ({ useUserLibrary: () => ({ data: [], isError: false }) }));
jest.mock('@rranker/game-maimai/hooks/use-detailed-catalog', () => ({ useDetailedCatalog: () => ({ data: undefined, error: null, refetch: jest.fn(async () => ({ data: undefined })) }) }));
jest.mock('@rranker/game-chunithm/hooks/use-chunithm-catalog', () => ({ useChunithmCatalog: () => ({ data: undefined, isLoading: false, isError: false }) }));
jest.mock('@rranker/game-rizline/services/rizline-catalog-query', () => ({ refreshRizlineCatalog: () => mockRefreshCatalog() }));
jest.mock('@rranker/sdk/state/session-store', () => ({ applyLxnsTokenRotation: jest.fn(), useSession: (() => { const hook = (selector: (state: object) => unknown) => selector({
  boundAccounts: [mockAccount], activeGameId: 'rizline', activeAccountId: mockAccount.id, session: null, sessionsByAccountId: {}, updateBoundAccountScore: jest.fn(),
}); return Object.assign(hook, { getState: () => hook(state => state), subscribe: () => () => undefined }); })() }));
jest.mock('@rranker/sdk/state/toolbox-pins', () => ({ useToolboxPins: (selector: (state: object) => unknown) => selector({
  pinsByGame: { rizline: [] },   hydrate: jest.fn(async () => undefined),
}) }));
jest.mock('@rranker/sdk/state/game-picker-ui', () => ({ useGamePickerUi: (selector: (state: object) => unknown) => selector({ expandedGameId: 'rizline', setExpandedGameId: jest.fn(), toggleExpandedGameId: jest.fn() }) }));
jest.mock('@rranker/sdk/state/query-client', () => ({ queryClient: { cancelQueries: jest.fn(async () => undefined), invalidateQueries: jest.fn(async () => undefined), getQueryData: () => mockBundle } }));
jest.mock('@rranker/sdk/services/invalidate-account-data', () => ({ invalidateAccountDataQueries: jest.fn(async () => undefined) }));
jest.mock('@rranker/sdk/services/switch-bound-account', () => ({ switchBoundAccount: jest.fn() }));
jest.mock('@rranker/tool-maimai/services/refresh-diving-fish-accounts', () => ({ refreshDivingFishAccounts: jest.fn() }));
jest.mock('@rranker/game-maimai/domain/maimai-maintenance', () => ({ MAIMAI_MAINTENANCE_MESSAGE: '维护', isMaimaiMaintenanceWindow: () => false }));
jest.mock('@rranker/game-chunithm/domain/chunithm-maintenance', () => ({ CHUNITHM_MAINTENANCE_MESSAGE: '维护', isChunithmMaintenanceWindow: () => false }));

describe('Rizline overview', () => {
  beforeEach(() => { jest.clearAllMocks(); mockBundle = createBundle(); mockSyncOrder = []; });
  afterEach(async () => { await cleanup(); });

  it('shows the player and official total independently of estimated group contributions', async () => {
    const screen = await render(<OverviewScreen />);
    expect(screen.getByText('Rizline · 玩家概览')).toBeTruthy();
    expect(screen.getByLabelText('当前玩家 Rizline 玩家，点击切换账号')).toBeTruthy();
    const rating = within(screen.getByTestId('dx-rating-card'));
    expect(rating.getByText('Ranking Score')).toBeTruthy();
    expect(rating.getByTestId('dx-rating-card-value')).toHaveTextContent('136.1235');
    expect(rating.getByText('AH5（推定） 3.5625 · B35（推定） 2.2222')).toBeTruthy();
    expect(screen.queryByTestId('dx-rating-card-stars')).toBeNull();
  });

  it('calls the shared refresh flow from synchronization', async () => {
    const screen = await render(<OverviewScreen />);
    const sync = screen.getByLabelText('同步数据，当前 官方账号');
    await fireEvent.press(sync);
    await waitFor(() => expect(mockRefetch).toHaveBeenCalledTimes(1));
    expect(mockSyncOrder).toEqual(['catalog', 'scores']);
    await waitFor(() => expect(screen.getByLabelText('同步数据，当前 官方账号')).toBeEnabled());
    expect(mockShowNotification).not.toHaveBeenCalled();
  });

  it('exposes random songs through the toolbox and opens the personal library', async () => {
    const screen = await render(<OverviewScreen />);
    expect(screen.getByText('成绩图片 · 随机歌曲 · 音游地图')).toBeTruthy();
    await fireEvent.press(screen.getByText('工具箱'));
    expect(mockPush).toHaveBeenLastCalledWith('/tools');
    expect(screen.getByText('收藏 0 首 · 练习 0 张')).toBeTruthy();
    await fireEvent.press(screen.getByText('我的曲库'));
    expect(mockPush).toHaveBeenLastCalledWith('/library');
  });

  it('offers both registered tools through the shared toolbox screen', async () => {
    const screen = await render(<ToolsScreen />);
    await fireEvent.press(screen.getByText('随机歌曲'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/plugins/[pluginId]/[pageId]', params: { pluginId: 'tool.rizline', pageId: 'random-charts', gameId: 'rizline' } });
    expect(screen.queryByText('我的曲库')).toBeNull();
    await fireEvent.press(screen.getByText('音游地图'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/plugins/[pluginId]/[pageId]', params: { pluginId: 'tool.arcade-finder', pageId: 'arcade-finder', gameId: 'rizline' } });
  });

  it('keeps the official total visible with missing contribution values and an expired-login message', async () => {
    mockBundle = createBundle(true, true);
    const screen = await render(<OverviewScreen />);
    expect(screen.getByTestId('dx-rating-card-value')).toHaveTextContent('136.1235');
    expect(screen.getByText('AH5（推定） — · B35（推定） —')).toBeTruthy();
    expect(screen.getByText('登录已失效，请在游戏管理中重新绑定账号。')).toBeTruthy();
  });
});
