import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { OverviewScreen } from '../app/(tabs)/(overview)/index';
import { createChunithmBoundAccount } from '@/domain/bound-account';

const mockRefetch = jest.fn<() => Promise<{ data: unknown }>>();
const mockShowNotification = jest.fn();
const mockAccount = createChunithmBoundAccount({
  displayName: '中二玩家',
  rating: 17.25,
  playerId: '123456789',
  accountId: 'chunithm:lxns:credential-1',
});

const mockScore = (id: number, rating: number) => ({
  id,
  song_name: `歌曲${id}`,
  level: '14',
  level_index: 3,
  score: 1_000_000,
  rating,
  clear: 'clear',
  full_combo: null,
  full_chain: null,
});
const mockBundle = {
  gameId: 'chunithm',
  providerId: 'lxns',
  profile: {
    title: '中二节奏',
    ratingLabel: 'RATING',
    ratingDigits: 2,
    capabilities: {
      hasCatalog: true,
      hasRecords: true,
      hasBestList: true,
      hasTools: false,
    },
  },
  payload: {
    kind: 'chunithm',
    player: { name: '中二玩家' },
    scores: [],
    bestSections: [
      { id: 'b30', title: 'Best 30', scores: [mockScore(1, 15), mockScore(2, 16)] },
      { id: 'new20', title: 'New 20', scores: [mockScore(3, 14)] },
    ],
    playerScore: { label: 'RATING', value: 17.25, display: '17.25' },
    source: {
      kind: 'lxns',
      label: '落雪咖啡屋',
      updatedAt: '2026-07-28T00:00:00.000Z',
      isStale: false,
    },
    hasSyncedData: true,
  },
} as const;

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/components/AppNotification', () => ({
  useNotification: () => ({ showNotification: mockShowNotification }),
}));
jest.mock('@/components/AccountSwitchSheet', () => ({ AccountSwitchSheet: () => null }));
jest.mock('@/components/UploadDataSheet', () => ({ UploadDataSheet: () => null }));
jest.mock('@/components/chunithm/ChunithmSyncGuideSheet', () => ({
  ChunithmSyncGuideSheet: ({
    visible,
    onSync,
  }: {
    visible: boolean;
    onSync: () => Promise<boolean>;
  }) => {
    const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return visible ? (
      <>
        <Text>中二同步引导已打开</Text>
        <Pressable accessibilityLabel="引导内同步" onPress={() => void onSync()} />
      </>
    ) : null;
  },
}));
jest.mock('@/components/SourceStatus', () => ({
  SourceStatus: ({ items }: { items: { key: string; label: string }[] }) => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <>{items.map((item) => <Text key={item.key}>{`${item.key}:${item.label}`}</Text>)}</>;
  },
}));
jest.mock('@/components/DxRatingCard', () => ({
  DxRatingCard: ({ meta }: { meta: string }) => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text>{meta}</Text>;
  },
}));
jest.mock('@/components/QueryStateView', () => ({
  QueryStateView: ({ data, renderData }: { data: unknown; renderData: (value: unknown) => unknown }) => (
    renderData(data)
  ),
}));
jest.mock('@/hooks/use-native-tab-bottom-inset', () => ({ useNativeTabBottomInset: () => 0 }));
jest.mock('@/hooks/use-user-library', () => ({
  useUserLibrary: () => ({ data: [], isError: false }),
}));
jest.mock('@/hooks/use-detailed-catalog', () => ({
  useDetailedCatalog: () => ({
    data: undefined,
    error: null,
    refetch: jest.fn(async () => ({ data: undefined })),
  }),
}));
jest.mock('@/hooks/use-chunithm-catalog', () => ({
  useChunithmCatalog: () => ({
    data: {
      source: {
        kind: 'lxns',
        label: 'LXNS 中二节奏公共曲库',
        updatedAt: '2026-07-28T00:00:00.000Z',
        isStale: false,
      },
    },
    isLoading: false,
    isError: false,
  }),
}));
jest.mock('@/hooks/use-game-data', () => ({
  useGameData: () => ({
    data: mockBundle,
    isLoading: false,
    isError: false,
    error: null,
    refetch: mockRefetch,
    profile: { ratingLabel: 'RATING', ratingDigits: 2 },
  }),
}));
jest.mock('@/state/session-store', () => ({
  applyLxnsTokenRotation: jest.fn(),
  useSession: (selector: (state: unknown) => unknown) => selector({
    boundAccounts: [mockAccount],
    activeGameId: 'chunithm',
    activeAccountId: mockAccount.id,
    session: {
      mode: 'lxns-oauth',
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 60_000,
      persistable: true,
    },
    sessionsByAccountId: {},
    updateBoundAccountScore: jest.fn(),
  }),
}));
jest.mock('@/state/toolbox-pins', () => ({
  useToolboxPins: (selector: (state: unknown) => unknown) => selector({
    pinnedToolIdsByGame: { maimai: [], chunithm: [], phigros: [], test: [] },
    pinnedPlateIdsByGame: { maimai: [], chunithm: [], phigros: [], test: [] },
    hydrate: jest.fn(async () => undefined),
  }),
}));
jest.mock('@/state/game-picker-ui', () => ({
  useGamePickerUi: (selector: (state: unknown) => unknown) => selector({
    expandedGameId: 'chunithm',
    setExpandedGameId: jest.fn(),
    toggleExpandedGameId: jest.fn(),
  }),
}));
jest.mock('@/state/query-client', () => ({
  queryClient: { cancelQueries: jest.fn(async () => undefined), invalidateQueries: jest.fn() },
}));
jest.mock('@/services/invalidate-account-data', () => ({
  invalidateAccountDataQueries: jest.fn(async () => undefined),
}));
jest.mock('@/services/refresh-diving-fish-accounts', () => ({
  refreshDivingFishAccounts: jest.fn(),
}));

describe('Chunithm overview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRefetch.mockResolvedValue({ data: mockBundle });
  });

  it('shows Best30/New20 averages, both sources and working upload/sync actions', async () => {
    const screen = await render(<OverviewScreen />);

    expect(screen.getByText('Best30 15.50 · New20 14.00')).toBeTruthy();
    expect(screen.getByText('scores:落雪咖啡屋')).toBeTruthy();
    expect(screen.getByText('catalog:LXNS 中二节奏公共曲库')).toBeTruthy();
    expect(screen.queryByText(/成绩：/)).toBeNull();
    const upload = screen.getByLabelText('上传数据，打开同步引导');
    expect(screen.getByText('同步引导')).toBeTruthy();

    await fireEvent.press(upload);
    expect(screen.getByText('中二同步引导已打开')).toBeTruthy();
    expect(mockRefetch).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByLabelText('同步数据，当前 落雪咖啡屋'));
    await waitFor(() => expect(mockRefetch).toHaveBeenCalledTimes(1));
    expect(mockShowNotification).not.toHaveBeenCalled();
  });
});
