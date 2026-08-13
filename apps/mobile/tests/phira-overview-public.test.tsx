import { render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import type { ReactNode } from 'react';
import { OverviewScreen } from '../app/(tabs)/(overview)/index';
import { createPhiraBoundAccount } from '@/domain/bound-account';

const mockAccount = createPhiraBoundAccount({ playerId: 323528, displayName: '尘言', rks: 5.3326573 });
const mockRefetch = jest.fn(async () => ({ data: mockBundle }));
const mockBundle = {
  gameId: 'phira', providerId: 'phira-community',
  profile: { id: 'phira', title: 'Phira', ratingLabel: 'Ranking Score', ratingDigits: 4,
    bestSections: [{ id: 'best20', title: 'Best20', size: 20 }], capabilities: { hasCatalog: true, hasRecords: true, hasBestList: true, hasTools: true } },
  payload: {
    kind: 'phira', snapshot: {
      player: { id: 323528, name: '尘言', avatar: null, rks: 5.3326573, bio: null },
      stats: { numRecords: 217, avgAccuracy: .991174 }, pool: { bestPool: [], recentPool: [], rks: 5.3326573 },
      recent: [], seedCharts: [], source: { kind: 'phira', label: 'Phira 社区公开数据', updatedAt: '2026-08-13T09:00:00.000Z', isStale: false },
    }, bests: null, playerScore: { label: 'Ranking Score', value: 5.3326573, display: '5.3327' },
    source: { kind: 'phira', label: 'Phira 社区公开数据', updatedAt: '2026-08-13T09:00:00.000Z', isStale: false },
  },
} as const;

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/components/AppNotification', () => ({ useNotification: () => ({ showNotification: jest.fn(), showActionNotification: jest.fn() }) }));
jest.mock('@/components/AccountSwitchSheet', () => ({ AccountSwitchSheet: () => null }));
jest.mock('@/components/UploadDataSheet', () => ({ UploadDataSheet: () => null }));
jest.mock('@/components/maimai/MaimaiUploadTabs', () => ({ MaimaiUploadTabs: () => null }));
jest.mock('@/components/maimai/MaimaiSyncGuideSheet', () => ({ MaimaiSyncGuideContent: () => null }));
jest.mock('@/components/chunithm/ChunithmSyncGuideSheet', () => ({ ChunithmSyncGuideSheet: () => null }));
jest.mock('@/components/SourceStatus', () => ({ SourceStatus: ({ items }: { items: { label: string }[] }) => { const RN = jest.requireActual<typeof import('react-native')>('react-native'); return <RN.Text>{items.map((item) => item.label).join(' · ')}</RN.Text>; } }));
jest.mock('@/components/DxRatingCard', () => ({ DxRatingCard: ({ label, display, meta, sideBadge }: { label: string; display: string; meta: string; sideBadge?: { title: string; value: string } }) => { const RN = jest.requireActual<typeof import('react-native')>('react-native'); return <RN.Text>{`${label} ${display} · ${meta} · ${sideBadge?.title} ${sideBadge?.value}`}</RN.Text>; } }));
jest.mock('@/components/QueryStateView', () => ({ QueryStateView: ({ data, renderData }: { data: unknown; renderData: (value: unknown) => ReactNode }) => renderData(data) }));
jest.mock('@/hooks/use-game-data', () => ({ useGameData: () => ({ data: mockBundle, isLoading: false, isError: false, error: null, refetch: mockRefetch, profile: mockBundle.profile }) }));
jest.mock('@/hooks/use-native-tab-bottom-inset', () => ({ useNativeTabBottomInset: () => 0 }));
jest.mock('@/hooks/use-user-library', () => ({ useUserLibrary: () => ({ data: [], isError: false }) }));
jest.mock('@/hooks/use-detailed-catalog', () => ({ useDetailedCatalog: () => ({ data: undefined, error: null, refetch: jest.fn(async () => ({ data: undefined })) }) }));
jest.mock('@/hooks/use-chunithm-catalog', () => ({ useChunithmCatalog: () => ({ data: undefined, isLoading: false, isError: false }) }));
jest.mock('@/state/session-store', () => ({ applyLxnsTokenRotation: jest.fn(), useSession: (selector: (state: object) => unknown) => selector({ boundAccounts: [mockAccount], activeGameId: 'phira', activeAccountId: mockAccount.id, session: null, sessionsByAccountId: {}, updateBoundAccountScore: jest.fn() }) }));
jest.mock('@/state/toolbox-pins', () => ({ useToolboxPins: (selector: (state: object) => unknown) => selector({ pinnedToolIdsByGame: { maimai: [], chunithm: [], phigros: [], phira: [], adofai: [], musedash: [], test: [] }, pinnedPlateIdsByGame: { maimai: [], chunithm: [], phigros: [], phira: [], adofai: [], musedash: [], test: [] }, pinnedCollectionIdsByGame: { maimai: [], chunithm: [], phigros: [], phira: [], adofai: [], musedash: [], test: [] }, hydrate: jest.fn(async () => undefined) }) }));
jest.mock('@/state/game-picker-ui', () => ({ useGamePickerUi: (selector: (state: object) => unknown) => selector({ expandedGameId: 'phira', setExpandedGameId: jest.fn(), toggleExpandedGameId: jest.fn() }) }));
jest.mock('@/state/query-client', () => ({ queryClient: { cancelQueries: jest.fn(async () => undefined), invalidateQueries: jest.fn(async () => undefined), getQueryData: jest.fn() } }));
jest.mock('@/services/invalidate-account-data', () => ({ invalidateAccountDataQueries: jest.fn(async () => undefined) }));
jest.mock('@/services/switch-bound-account', () => ({ switchBoundAccount: jest.fn() }));
jest.mock('@/services/refresh-diving-fish-accounts', () => ({ refreshDivingFishAccounts: jest.fn() }));
jest.mock('@/domain/maimai-maintenance', () => ({ MAIMAI_MAINTENANCE_MESSAGE: '维护', isMaimaiMaintenanceWindow: () => false }));
jest.mock('@/domain/chunithm-maintenance', () => ({ CHUNITHM_MAINTENANCE_MESSAGE: '维护', isChunithmMaintenanceWindow: () => false }));

test('Phira overview shows the three requested public metrics and no practice count', async () => {
  const screen = await render(<OverviewScreen />);
  expect(screen.getByText('Phira · 玩家概览')).toBeTruthy();
  expect(screen.getByText('Ranking Score 5.3327 · 总游玩次数 217 · 平均准确率 99.12%')).toBeTruthy();
  expect(screen.getByText(/Phira 社区公开数据/)).toBeTruthy();
  expect(screen.getByText('收藏 0 首')).toBeTruthy();
  expect(screen.queryByText(/练习 0 张/)).toBeNull();
  await screen.unmount();
});
