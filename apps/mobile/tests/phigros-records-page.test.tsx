import { render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { RecordsScreen } from '../app/(tabs)/records';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

type MockSessionState = {
  activeGameId: string;
  activeAccountId: string;
  activeProviderId: string | null;
  session: { mode: string } | null;
};
let mockSessionState: MockSessionState;
jest.mock('@/state/session-store', () => ({
  UNBOUND_ACCOUNT_ID: 'maimai:unbound',
  useSession: (selector: (state: MockSessionState) => unknown) => selector(mockSessionState),
}));

let mockGameQuery: Record<string, unknown>;
let mockCatalogQuery: Record<string, unknown>;
let mockTagsQuery: Record<string, unknown>;
jest.mock('@/hooks/use-game-data', () => ({ useGameData: () => mockGameQuery }));
jest.mock('@/hooks/use-phigros-catalog', () => ({ usePhigrosCatalog: () => mockCatalogQuery }));
jest.mock('@/hooks/use-phigros-kyou', () => ({ usePhigrosKyouChartTags: () => mockTagsQuery }));
jest.mock('@/hooks/use-native-tab-bottom-inset', () => ({ useNativeTabBottomInset: () => 0 }));
jest.mock('@/hooks/use-debounced-value', () => ({ useDebouncedValue: (value: unknown) => value }));
jest.mock('@/hooks/use-score-snapshot', () => ({
  useScoreSnapshot: () => ({ data: null, isLoading: false, isError: false, error: null, refetch: jest.fn() }),
}));
jest.mock('@/hooks/use-detailed-catalog', () => ({
  useDetailedCatalog: () => ({ data: null, isLoading: false, isError: false, error: null, refetch: jest.fn() }),
}));
jest.mock('@/hooks/use-dxrating-chart-tags', () => ({
  useDxRatingChartTags: () => ({ data: null, isLoading: false, isError: false, error: null, refetch: jest.fn() }),
}));
jest.mock('@/state/records-filter', () => ({
  useRecordsFilter: () => ({
    keyword: '', collapsed: false, difficulty: 'all', version: 'all', type: 'all',
    constantMin: null, constantMax: null, achievementMin: null, achievementMax: null,
    soloAchievement: 'all', multiAchievement: 'all', versionLocale: 'all', selectedDxRatingTagIds: [],
    setKeyword: jest.fn(), setCollapsed: jest.fn(), setDifficulty: jest.fn(), setVersion: jest.fn(),
    setType: jest.fn(), setConstantMin: jest.fn(), setConstantMax: jest.fn(),
    setAchievementMin: jest.fn(), setAchievementMax: jest.fn(), setSoloAchievement: jest.fn(),
    setMultiAchievement: jest.fn(), setVersionLocale: jest.fn(), setSelectedDxRatingTagIds: jest.fn(),
    clearFilters: jest.fn(),
  }),
}));
jest.mock('@/state/phigros-records-filter', () => ({
  usePhigrosRecordsFilter: () => ({
    keyword: '', collapsed: false, level: 'all', constantMin: '', constantMax: '',
    accuracyMin: '', accuracyMax: '', rank: null, xing: null, chapter: 'all',
    selectedKyouTagIds: [],
    setKeyword: jest.fn(), setCollapsed: jest.fn(), setLevel: jest.fn(), setConstantMin: jest.fn(),
    setConstantMax: jest.fn(), setAccuracyMin: jest.fn(), setAccuracyMax: jest.fn(), setRank: jest.fn(),
    setXing: jest.fn(), setChapter: jest.fn(), setSelectedKyouTagIds: jest.fn(), clearFilters: jest.fn(),
  }),
}));

const record = {
  songId: 'Song.A', title: 'Song.A', type: 'SD' as const, levelIndex: 2, level: 'IN' as const,
  difficulty: 'expert' as const, difficultyConstant: 15.2, achievements: 100, dxScore: 1_000_000,
  rating: 15.2, fc: 'ap' as const, fs: null, rate: 'phi' as const, version: 'current',
};

function setSuccessfulQueries() {
  mockGameQuery = {
    data: {
      gameId: 'phigros',
      providerId: 'phigros-test',
      profile: { ratingLabel: 'RKS' },
      payload: {
        kind: 'phigros',
        player: { id: 'phigros:test', displayName: '示例账号', rating: 16.17 },
        records: [record],
        source: { kind: 'generated', label: 'Phigros 示例数据', updatedAt: '2026-08-11T00:00:00.000Z', isStale: false },
        catalogSource: { kind: 'generated', label: 'Phigros3.8.0', updatedAt: '2026-08-11T00:00:00.000Z', isStale: false },
      },
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  };
  mockCatalogQuery = {
    data: {
      snapshot: {
        songs: [{ id: 'Song.A', title: '测试曲' }],
        versions: [],
        source: { kind: 'generated', label: 'Phigros3.8.0', updatedAt: '2026-08-11T00:00:00.000Z', isStale: false },
      },
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  };
  mockTagsQuery = {
    data: null,
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  };
}

describe('Phigros records screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setSuccessfulQueries();
  });

  it('renders the records list for the sample account without a session', async () => {
    mockSessionState = {
      activeGameId: 'phigros',
      activeAccountId: 'phigros:test',
      activeProviderId: 'phigros-test',
      session: null,
    };
    const screen = await render(<RecordsScreen />);
    expect(screen.getByTestId('phigros-records-list')).toBeTruthy();
    expect(screen.getByText('测试曲')).toBeTruthy();
    expect(screen.getByText('共 1 条成绩')).toBeTruthy();
    expect(screen.getByLabelText('Phigros 定数范围下限 15.2')).toBeTruthy();
    expect(screen.getByLabelText('Phigros 定数范围上限 15.2')).toBeTruthy();
    expect(screen.queryByText('尚未绑定 TapTap 账号')).toBeNull();
  });

  it('shows the unbound hint when no TapTap session exists', async () => {
    mockSessionState = {
      activeGameId: 'phigros',
      activeAccountId: 'phigros:phi-taptap:demo',
      activeProviderId: 'phi-taptap',
      session: null,
    };
    const screen = await render(<RecordsScreen />);
    expect(screen.queryByTestId('phigros-records-list')).toBeNull();
    expect(screen.getByText('尚未绑定 TapTap 账号')).toBeTruthy();
  });
});
