import { render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import type { ReactNode } from 'react';
import { OverviewScreen } from '../app/(tabs)/(overview)/index';
import { createMajdataBoundAccount } from '@rranker/game-majdata-net/accounts';
import { getGameProfile } from '@rranker/sdk/domain/game-profile';
import { majdataTotal, majdataTotalText, type MajdataSnapshot } from '@rranker/game-majdata-net/domain/majdata';

const mockAccount = createMajdataBoundAccount({ accountId: 'majdata-net:account:player', displayName: 'Player' });
const mockRefetch = jest.fn(async () => ({ data: mockBundle }));
const mockSnapshot: MajdataSnapshot = {
  player: { username: 'Player' },
  records: [{ dx: 100.1234, classic: 99.4567 }, { dx: 98.9876, classic: 97.1111 }].map((acc, index) => ({
    acc, dxScore: 1000, comboState: 1, chartLevel: index, hash: 'revision', timestamp: '2026-09-01T00:00:00Z',
    chartInfo: { id: '0dff2974-9419-4290-bea9-307caa5825b7', title: 'Song', artist: 'Artist', designer: 'Designer',
      uploader: 'Uploader', description: '', timestamp: '2026-09-01T00:00:00Z', hash: 'revision',
      levels: ['1', '3'], tags: [], publicTags: [] },
  })),
  recent: [], source: { kind: 'majdata-net', label: 'Majdata Net', updatedAt: '2026-09-01T00:00:00Z', isStale: false },
};
const mockBundle = {
  gameId: 'majdata-net', providerId: 'majdata-net', profile: getGameProfile('majdata-net'),
  payload: { kind: 'majdata-net', snapshot: mockSnapshot, source: mockSnapshot.source,
    playerScore: { label: 'DX · Classic', value: majdataTotal(mockSnapshot.records), display: majdataTotalText(mockSnapshot) } },
};

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@rranker/sdk/components/AppNotification', () => ({ useNotification: () => ({ showNotification: jest.fn(), showActionNotification: jest.fn() }) }));
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
jest.mock('@rranker/sdk/components/QueryStateView', () => ({ QueryStateView: ({ data, renderData }: { data: unknown; renderData: (value: unknown) => ReactNode }) => renderData(data) }));
jest.mock('@rranker/sdk/hooks/use-game-data', () => ({ useGameData: () => ({ data: mockBundle, isLoading: false, isError: false, error: null, refetch: mockRefetch, profile: mockBundle.profile }) }));
jest.mock('@rranker/sdk/hooks/use-native-tab-bottom-inset', () => ({ useNativeTabBottomInset: () => 0 }));
jest.mock('@rranker/sdk/hooks/use-user-library', () => ({ useUserLibrary: () => ({ data: [], isError: false }) }));
jest.mock('@rranker/game-maimai/hooks/use-detailed-catalog', () => ({ useDetailedCatalog: () => ({ data: undefined, error: null, refetch: jest.fn(async () => ({ data: undefined })) }) }));
jest.mock('@rranker/game-chunithm/hooks/use-chunithm-catalog', () => ({ useChunithmCatalog: () => ({ data: undefined, isLoading: false, isError: false }) }));
jest.mock('@rranker/sdk/state/session-store', () => ({ applyLxnsTokenRotation: jest.fn(), useSession: (selector: (state: object) => unknown) => selector({ boundAccounts: [mockAccount], activeGameId: 'majdata-net', activeAccountId: mockAccount.id, session: null, sessionsByAccountId: {}, updateBoundAccountScore: jest.fn() }) }));
jest.mock('@rranker/sdk/state/toolbox-pins', () => ({ useToolboxPins: (selector: (state: object) => unknown) => selector({ pinsByGame: { 'majdata-net': [], maimai: [], chunithm: [], phigros: [], phira: [], adofai: [], musedash: [], test: [] },   hydrate: jest.fn(async () => undefined) }) }));
jest.mock('@rranker/sdk/state/game-picker-ui', () => ({ useGamePickerUi: (selector: (state: object) => unknown) => selector({ expandedGameId: 'majdata-net', setExpandedGameId: jest.fn(), toggleExpandedGameId: jest.fn() }) }));
jest.mock('@rranker/sdk/state/query-client', () => ({ queryClient: { cancelQueries: jest.fn(async () => undefined), invalidateQueries: jest.fn(async () => undefined), getQueryData: jest.fn() } }));
jest.mock('@rranker/sdk/services/invalidate-account-data', () => ({ invalidateAccountDataQueries: jest.fn(async () => undefined) }));
jest.mock('@rranker/sdk/services/switch-bound-account', () => ({ switchBoundAccount: jest.fn() }));
jest.mock('@rranker/tool-maimai/services/refresh-diving-fish-accounts', () => ({ refreshDivingFishAccounts: jest.fn() }));
jest.mock('@rranker/game-maimai/domain/maimai-maintenance', () => ({ MAIMAI_MAINTENANCE_MESSAGE: '维护', isMaimaiMaintenanceWindow: () => false }));
jest.mock('@rranker/game-chunithm/domain/chunithm-maintenance', () => ({ CHUNITHM_MAINTENANCE_MESSAGE: '维护', isChunithmMaintenanceWindow: () => false }));

test('Majdata overview uses the original single value card with the combined total and both library counts', async () => {
  const screen = await render(<OverviewScreen />);
  expect(screen.getByText('Majdata Net · 玩家概览')).toBeTruthy();
  expect(screen.getByText('DX · Classic')).toBeTruthy();
  expect(screen.getByTestId('dx-rating-card-value')).toHaveTextContent('395.6788%');
  expect(screen.queryByTestId('dx-rating-card-stars')).toBeNull();
  expect(screen.queryByText('DX')).toBeNull();
  expect(screen.queryByText('Classic')).toBeNull();
  expect(screen.getByText('收藏 0 首 · 练习 0 张')).toBeTruthy();
  expect(screen.getByText('同步数据')).toBeTruthy();
  await screen.unmount();
});
