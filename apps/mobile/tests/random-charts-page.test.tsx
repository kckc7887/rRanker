import { fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { Text } from 'react-native';
import { RandomChartsPage } from '@/components/RandomChartsPage';
import { MaimaiRandomChartsScreen } from '@/screens/MaimaiRandomChartsScreen';
import { ChunithmRandomChartsScreen } from '@/screens/ChunithmRandomChartsScreen';
import { PhigrosRandomChartsScreen } from '@/screens/PhigrosRandomChartsScreen';
import type { CatalogSnapshot, ScoreRecord } from '@/domain/models';
import type { ChunithmCatalogSnapshot } from '@/domain/chunithm';
import { useThemeStore } from '@/state/theme-store';

const onCountChange = jest.fn();
const onDraw = jest.fn();
const mockCatalogRetry = jest.fn(async () => undefined);
const mockScoresRetry = jest.fn(async () => undefined);
const mockFilterActions = {
  hydrate: jest.fn(async () => undefined), setCount: jest.fn(), setCollapsed: jest.fn(),
  setDifficulty: jest.fn(), setVersion: jest.fn(), setType: jest.fn(),
  setConstantMin: jest.fn(), setConstantMax: jest.fn(), setAchievementMin: jest.fn(), setAchievementMax: jest.fn(),
  setSoloAchievement: jest.fn(), setMultiAchievement: jest.fn(), setSelectedDxRatingTagIds: jest.fn(), setVersionLocale: jest.fn(),
  setRankMin: jest.fn(), setRankMax: jest.fn(), setLevel: jest.fn(), setAccuracyMin: jest.fn(), setAccuracyMax: jest.fn(),
  setRank: jest.fn(), setXing: jest.fn(), setChapter: jest.fn(), setSelectedKyouTagIds: jest.fn(), clearFilters: jest.fn(),
};
let mockCatalogQuery: Record<string, unknown>;
let mockScoresQuery: Record<string, unknown>;
let mockFilters: Record<string, unknown>;

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { push: jest.fn() },
}));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
jest.mock('@/hooks/use-detailed-catalog', () => ({ useDetailedCatalog: () => mockCatalogQuery }));
jest.mock('@/hooks/use-chunithm-catalog', () => ({ useChunithmCatalog: () => mockCatalogQuery }));
jest.mock('@/hooks/use-phigros-catalog', () => ({ usePhigrosCatalog: () => mockCatalogQuery }));
jest.mock('@/hooks/use-score-snapshot', () => ({ useScoreSnapshot: () => mockScoresQuery }));
jest.mock('@/hooks/use-game-data', () => ({ useGameData: () => mockScoresQuery }));
jest.mock('@/hooks/use-dxrating-chart-tags', () => ({ useDxRatingChartTags: () => ({ data: undefined, isLoading: false, isError: false }) }));
jest.mock('@/hooks/use-phigros-kyou', () => ({ usePhigrosKyouChartTags: () => ({ data: undefined, isLoading: false, isError: false, refetch: jest.fn() }) }));
jest.mock('@/state/random-charts-filter', () => ({ useRandomChartsFilter: () => ({ ...mockFilters, ...mockFilterActions }) }));
jest.mock('@/state/chunithm-random-charts-filter', () => ({ useChunithmRandomChartsFilter: () => ({ ...mockFilters, ...mockFilterActions }) }));
jest.mock('@/state/phigros-random-charts-filter', () => ({ usePhigrosRandomChartsFilter: () => ({ ...mockFilters, ...mockFilterActions }) }));

describe('RandomChartsPage host contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps count, filter, draw and result regions in the shared shell', async () => {
    const screen = await render(
      <RandomChartsPage
        count={2}
        emptyMessage="无结果"
        filter={<Text>成绩页筛选器</Text>}
        hasDrawn
        onCountChange={onCountChange}
        onDraw={onDraw}
        poolSize={3}
        resultCount={1}
        results={<Text>结果卡片</Text>}
      />,
    );

    expect(screen.getByTestId('random-charts-scroll')).toBeTruthy();
    expect(screen.getByText('成绩页筛选器')).toBeTruthy();
    expect(screen.getByText('候选谱面 3 条')).toBeTruthy();
    expect(screen.getByText('结果卡片')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('抽取 4 首'));
    expect(onCountChange).toHaveBeenCalledWith(4);
    await fireEvent.press(screen.getByTestId('random-charts-draw'));
    expect(onDraw).toHaveBeenCalledTimes(1);
  });

  it('shows complete-pool progress and keeps drawing disabled until ready', async () => {
    const retry = jest.fn();
    const screen = await render(<RandomChartsPage
      count={1}
      drawDisabled
      emptyMessage="无结果"
      filter={<Text>筛选器</Text>}
      hasDrawn={false}
      onCountChange={onCountChange}
      onDraw={onDraw}
      onRetryPool={retry}
      poolError="有 1 页加载失败"
      poolSize={30}
      poolStatus="正在加载完整随机池 · 已加载 30/90"
      resultCount={0}
      results={null}
    />);
    expect(screen.getByText('正在加载完整随机池 · 已加载 30/90')).toBeTruthy();
    expect(screen.getByTestId('random-charts-draw').props.accessibilityState).toEqual({ disabled: true });
    await fireEvent.press(screen.getByTestId('random-charts-draw'));
    expect(onDraw).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('重试加载随机池'));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

const record: ScoreRecord = {
  songId: '1', title: '测试歌曲', type: 'DX', levelIndex: 3, level: '13', difficulty: 'master',
  difficultyConstant: 13, achievements: 99, dxScore: 900000, rating: 200, fc: null, fs: null, rate: 'ss', version: '版本',
};
const catalog: CatalogSnapshot = {
  currentVersion: { id: 1, title: '版本' }, versions: [{ id: 1, title: '版本' }], chartVersionIndex: {},
  source: { kind: 'lxns', label: 'LXNS', updatedAt: '', isStale: false },
  songs: [{ id: '1', title: '测试歌曲', version: '版本', charts: [record] }],
};
const phigrosRecord: ScoreRecord = { ...record, type: 'SD', levelIndex: 2, difficulty: 'expert', level: 'IN' };
const phigrosCatalog: CatalogSnapshot = { ...catalog, songs: [{ ...catalog.songs[0], charts: [phigrosRecord] }] };
const chunithmCatalog: ChunithmCatalogSnapshot = {
  currentVersion: catalog.currentVersion, versions: catalog.versions, genres: [], source: catalog.source,
  songs: [{ id: 1, title: '测试歌曲', genre: 'POPS', bpm: 180, versionId: 1, versionTitle: '版本', locked: false, disabled: false,
    difficulties: [{ difficulty: 3, level: '13', levelValue: 13, versionId: 1, versionTitle: '版本' }] }],
};

describe.each([
  { game: 'maimai', Page: MaimaiRandomChartsScreen, catalog, scores: { records: [record] }, filter: { achievementMin: '90' }, scoreText: '99.0000%' },
  { game: 'chunithm', Page: ChunithmRandomChartsScreen, catalog: chunithmCatalog,
    scores: { payload: { kind: 'chunithm', scores: [{ id: 1, level_index: 3, score: 1000000, clear: 'clear' }] } }, filter: { rankMin: 'S' }, scoreText: '1,000,000' },
  { game: 'phigros', Page: PhigrosRandomChartsScreen, catalog: { snapshot: phigrosCatalog },
    scores: { payload: { kind: 'phigros', records: [phigrosRecord] } }, filter: { accuracyMin: '90' }, scoreText: '99%' },
])('$game random chart data states', ({ Page, catalog: pageCatalog, scores, filter, scoreText }) => {
  beforeEach(() => {
    jest.clearAllMocks();
    useThemeStore.setState({ scoreCardArtworkEnabled: false });
    mockCatalogQuery = { data: pageCatalog, isLoading: false, isError: false, refetch: mockCatalogRetry };
    mockScoresQuery = { data: undefined, isLoading: true, isError: false, refetch: mockScoresRetry };
    mockFilters = {
      count: 1, collapsed: true, difficulty: 'all', version: 'all', type: 'all', constantMin: '', constantMax: '',
      achievementMin: '', achievementMax: '', soloAchievement: null, multiAchievement: null, selectedDxRatingTagIds: [], versionLocale: 'china',
      rankMin: null, rankMax: null, level: 'all', accuracyMin: '', accuracyMax: '', rank: null, xing: null, chapter: 'all', selectedKyouTagIds: [],
    };
  });

  it('waits for a missing catalog, retries failure, then draws without treating unknown scores as unplayed', async () => {
    mockCatalogQuery = { ...mockCatalogQuery, data: undefined, isLoading: true };
    const screen = await render(<Page />);
    expect(screen.queryByTestId('random-charts-draw')).toBeNull();
    mockCatalogQuery = { ...mockCatalogQuery, isLoading: false, isError: true, error: new Error('offline') };
    await screen.rerender(<Page />);
    expect(screen.getByText('加载失败，请重试')).toBeTruthy();
    await fireEvent.press(screen.getByText('重试'));
    expect(mockCatalogRetry).toHaveBeenCalledTimes(1);

    mockCatalogQuery = { ...mockCatalogQuery, data: pageCatalog, isError: false, error: null };
    await screen.rerender(<Page />);
    expect(screen.getByText('正在读取成绩…')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('random-charts-draw'));
    expect(screen.getByText('测试歌曲')).toBeTruthy();
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);
    expect(screen.queryByText('未游玩')).toBeNull();

    mockScoresQuery = { ...mockScoresQuery, data: scores, isLoading: false };
    await screen.rerender(<Page />);
    expect(screen.getByText(scoreText)).toBeTruthy();
    await screen.unmount();
  });

  it('pauses score filters until retry succeeds, then continues using cached data after refresh errors', async () => {
    mockFilters = { ...mockFilters, ...filter };
    const screen = await render(<Page />);
    await fireEvent.press(screen.getByTestId('random-charts-draw'));
    expect(screen.queryByTestId('random-charts-results')).toBeNull();
    mockScoresQuery = { ...mockScoresQuery, isLoading: false, isError: true, error: new Error('offline') };
    await screen.rerender(<Page />);
    expect(screen.getByText('成绩读取失败，请重试。')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('重试加载随机池'));
    expect(mockScoresRetry).toHaveBeenCalledTimes(1);

    mockScoresQuery = { ...mockScoresQuery, data: scores };
    mockCatalogQuery = { ...mockCatalogQuery, isError: true, error: new Error('offline') };
    await screen.rerender(<Page />);
    expect(screen.getByText('曲库刷新失败，请重试。')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('random-charts-draw'));
    expect(screen.getByText(scoreText)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('重试加载随机池'));
    expect(mockCatalogRetry).toHaveBeenCalledTimes(1);
    await screen.unmount();
  });
});
