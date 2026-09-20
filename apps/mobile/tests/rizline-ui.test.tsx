import { cleanup, fireEvent, render, within } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { Animated, InteractionManager, processColor } from 'react-native';
import { RizlineScoreCard } from '@/components/rizline/RizlineScoreCard';
import { RizlineSongDetail } from '@/components/rizline/RizlineSongDetail';
import { RizlineSongRow } from '@/components/rizline/RizlineSongRow';
import { RizlineDifficultyBadge } from '@/components/rizline/RizlineScoreVisuals';
import { BADGE_GOLD_BORDER_COLORS } from '@/domain/badge-theme';
import { RIZLINE_DIFFICULTIES, rizlineDifficultyColors, type RizlineRecord } from '@/domain/rizline';
import { METRIC_GRADIENT_THEMES } from '@/domain/metric-gradient-theme';
import { RizlineBestScreen, RizlineRecordsScreen } from '@/screens/RizlineScreens';
import { RizlineRandomChartsScreen } from '@/screens/RizlineRandomChartsScreen';
import UserLibraryScreen from '../app/library/index';
import type { UserLibraryItem } from '@/domain/user-library';
import { rizlineChart, rizlineRecord, rizlineSong } from './rizline-ui-fixtures';

const mockPush = jest.fn(); const mockSetPractice = jest.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);
const mockSetTags = jest.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);
const mockSetFavorite = jest.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);
let mockSong = rizlineSong(); let mockRecords = [rizlineRecord()];
let mockUnknownCandidates = false;
let mockLibraryItems: UserLibraryItem[] = [];
let mockGameDataState = { hasData: true, isLoading: false, isError: false };

jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, router: { push: (...args: unknown[]) => mockPush(...args), replace: jest.fn() },
  useNavigation: () => ({ canGoBack: () => true, goBack: jest.fn(), getState: () => ({ index: 0, routes: [] }) }) }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('react-native-gesture-handler', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return { GestureHandlerRootView: RN.View, Pressable: RN.Pressable, ScrollView: RN.ScrollView };
});
jest.mock('react-native-safe-area-context', () => ({
  ...(jest.requireActual('react-native-safe-area-context') as object),
  useSafeAreaInsets: () => ({ top: 47, right: 0, bottom: 34, left: 0 }),
}));
jest.mock('@/hooks/use-native-tab-bottom-inset', () => ({ useNativeTabBottomInset: () => 0 }));
jest.mock('@/state/session-store', () => ({ useSession: (selector: (state: object) => unknown) => selector({ activeGameId: 'rizline', activeAccountId: 'rizline:1' }) }));
jest.mock('@/components/AppNotification', () => ({ useNotification: () => ({ showNotification: jest.fn() }), useNotificationModalRequestClose: () => () => false }));
jest.mock('@/hooks/use-rizline-catalog', () => ({ useRizlineCatalog: () => ({
  data: { snapshot: { schemaVersion: 1, resourceVersion: 'v1', gameVersion: '2.7.1', songs: [mockSong] } },
  isLoading: false, isError: false, error: null, refetch: jest.fn(),
}) }));
jest.mock('@/hooks/use-game-data', () => ({ useGameData: () => ({
  data: mockGameDataState.hasData ? { payload: { kind: 'rizline', records: mockRecords, best: { ah5: mockRecords, b35: mockRecords, ah5Contribution: 1, b35Contribution: 2, hasUnknownCandidates: mockUnknownCandidates } } } : undefined,
  isLoading: mockGameDataState.isLoading, isError: mockGameDataState.isError, isFetching: false, error: null, refetch: jest.fn(),
}) }));
jest.mock('@/state/rizline-random-charts-filter', () => ({ useRizlineRandomChartsFilter: () => ({
  count: 1, difficulty: 'IN', packId: 'all', constantMin: '12', constantMax: '12', collapsed: true,
  hydrate: jest.fn(async () => undefined), setCount: jest.fn(), setCollapsed: jest.fn(), setDifficulty: jest.fn(),
  setPackId: jest.fn(), setConstantMin: jest.fn(), setConstantMax: jest.fn(), clearFilters: jest.fn(),
}) }));
jest.mock('@/hooks/use-user-library', () => ({ useUserLibrary: () => ({
  data: mockLibraryItems, isLoading: false, isError: false, isUpdating: false, tagPresets: [], refetch: jest.fn(),
  setSongFavorite: (...args: unknown[]) => mockSetFavorite(...args),
  setChartPractice: (...args: unknown[]) => mockSetPractice(...args),
  setTags: (...args: unknown[]) => mockSetTags(...args), setTagPresets: jest.fn(),
  songKey: (songId: string) => `song:rizline:${songId}`, chartKey: (songId: string, type: string, index: number) => `chart:rizline:${songId}:${type}:${index}`,
}) }));

describe('Rizline UI', () => {
  beforeEach(() => {
    jest.clearAllMocks(); mockSong = rizlineSong(); mockRecords = [rizlineRecord()]; mockUnknownCandidates = false; mockLibraryItems = [];
    mockGameDataState = { hasData: true, isLoading: false, isError: false };
    jest.spyOn(Animated, 'loop').mockReturnValue({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() });
    jest.spyOn(Animated, 'timing');
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((callback) => {
      (callback as () => void)();
      return { cancel: jest.fn() } as unknown as ReturnType<typeof InteractionManager.runAfterInteractions>;
    });
  });
  afterEach(async () => { await cleanup(); jest.restoreAllMocks(); });

  it('renders score metrics and opens the actual chart difficulty', async () => {
    const screen = await render(<RizlineScoreCard record={mockRecords[0]!} />);
    expect(screen.getByText('119.1235%')).toBeTruthy(); expect(screen.getByText('139.1235')).toBeTruthy();
    expect(screen.getByText('RKS')).toHaveStyle({ fontSize: 10 });
    expect(screen.queryByText('AP')).toBeNull();
    await fireEvent.press(screen.getByTestId('rizline-score-song.a.IN'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/songs/[songId]', params: { songId: 'song.a', levelIndex: '2' } });
  });

  it('shows both inferred best sections and orders records by RKS', async () => {
    mockUnknownCandidates = true;
    const best = await render(<RizlineBestScreen />);
    expect(best.getByText('AH5（推定）')).toBeTruthy(); expect(best.getByText('Best35（推定）')).toBeTruthy();
    expect(best.getByText(/贡献值暂显示为 —/)).toBeTruthy();
    await cleanup();
    mockRecords = [rizlineRecord(rizlineChart('HD'), { rks: 120 }), rizlineRecord(rizlineChart('IN'), { rks: 140 })];
    const records = await render(<RizlineRecordsScreen />);
    const cards = records.getAllByTestId(/^rizline-score-/);
    expect(cards.map((card) => card.props.testID)).toEqual(['rizline-score-song.a.IN', 'rizline-score-song.a.HD']);
  });

  it('defaults to IN in reversed difficulty order and keeps metadata below the cover', async () => {
    const screen = await render(<RizlineSongDetail songId="song.a" />);
    const carousel = screen.getByTestId('rizline-chart-carousel');
    expect(carousel.props.contentOffset.x).toBe(carousel.props.snapToInterval);
    expect(screen.getAllByTestId(/^rizline-chart-(AT|IN|HD|EZ)$/).map((card) => card.props.testID))
      .toEqual(['rizline-chart-AT', 'rizline-chart-IN', 'rizline-chart-HD', 'rizline-chart-EZ']);
    expect(screen.getAllByText('2:05').length).toBeGreaterThan(0);
    expect(screen.queryByText('歌曲信息')).toBeNull(); expect(screen.queryByText('相关成就')).toBeNull();
    expect(screen.queryByText('初见成就')).toBeNull(); expect(screen.queryByText(/更新时间/)).toBeNull();
    const chart = within(screen.getByTestId('rizline-chart-IN'));
    expect(chart.getByText('HIT')).toBeTruthy(); expect(chart.getByText('COMBO')).toBeTruthy(); expect(chart.getByText('Max Score')).toBeTruthy();
    for (const difficulty of ['AT', 'IN', 'HD', 'EZ'] as const) {
      const difficultyCard = within(screen.getByTestId(`rizline-chart-${difficulty}`));
      expect(difficultyCard.getByLabelText('加入练习清单')).toHaveStyle({
        backgroundColor: rizlineDifficultyColors(difficulty).bg, borderColor: rizlineDifficultyColors(difficulty).bg,
      });
      expect(difficultyCard.getByText('加入练习清单')).toHaveStyle({ color: '#FFFFFF' });
    }
    await fireEvent.press(chart.getByLabelText('加入练习清单'));
    expect(mockSetPractice).toHaveBeenCalledWith('song.a', 'SD', 2, true);
    const preview = chart.getByLabelText('查看谱面确认：测试歌曲 IN');
    const inActions = chart.getAllByRole('button').map((button) => button.props.accessibilityLabel);
    expect(inActions.indexOf('查看谱面确认：测试歌曲 IN'))
      .toBe(inActions.indexOf('加入练习清单') + 1);
    expect(preview).toHaveStyle({
      backgroundColor: rizlineDifficultyColors('IN').bg, borderColor: rizlineDifficultyColors('IN').bg,
    });
    expect(chart.getByText('查看谱面确认')).toHaveStyle({ color: '#FFFFFF' });
    await fireEvent.press(preview);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/songs/rizline-chart-preview',
      params: { songId: 'song.a', levelIndex: '2', title: '测试歌曲 IN' },
    });
    await fireEvent.changeText(within(screen.getByTestId('rizline-chart-tags-IN')).getByLabelText('新标签'), '交互');
    await fireEvent.press(within(screen.getByTestId('rizline-chart-tags-IN')).getByLabelText('添加标签'));
    expect(mockSetTags).toHaveBeenCalledWith({ kind: 'chart', songId: 'song.a', type: 'SD', levelIndex: 2 }, ['交互']);
    await fireEvent.changeText(within(screen.getByTestId('rizline-song-tags')).getByLabelText('新标签'), '喜欢');
    await fireEvent.press(within(screen.getByTestId('rizline-song-tags')).getByLabelText('添加标签'));
    expect(mockSetTags).toHaveBeenCalledWith({ kind: 'song', songId: 'song.a' }, ['喜欢']);
  });

  it('preserves independent SP ids in practice and leaves unavailable scores blank', async () => {
    mockSong = rizlineSong({ id: 'song.a.sp', charts: [rizlineChart('SP', null, 'song.a.sp')] });
    const screen = await render(<RizlineSongDetail songId="song.a.sp" initialLevelIndex={4} />);
    const chart = within(screen.getByTestId('rizline-chart-SP'));
    expect(chart.getAllByText('—').length).toBeGreaterThanOrEqual(3);
    expect(chart.queryByText('AP')).toBeNull();
    expect(chart.queryByText('AH')).toBeNull();
    expect(chart.getByLabelText('加入练习清单')).toHaveStyle({ backgroundColor: rizlineDifficultyColors('SP').bg });
    await fireEvent.press(chart.getByLabelText('加入练习清单'));
    expect(mockSetPractice).toHaveBeenCalledWith('song.a.sp', 'SD', 4, true);
  });

  it.each(RIZLINE_DIFFICULTIES)('uses the shared white-text capsule for %s', async (difficulty) => {
    const screen = await render(<RizlineDifficultyBadge difficulty={difficulty} level="12" />);
    expect(screen.getByTestId(`rizline-difficulty-${difficulty}`)).toHaveStyle({ borderRadius: 999, height: 24 });
    expect(screen.getByText(`${difficulty} 12`)).toHaveStyle({ color: '#FFFFFF' });
  });

  it('shows catalog song-row badges as constants without difficulty names', async () => {
    const screen = await render(<RizlineSongRow song={rizlineSong()} />);
    expect(screen.getByText('测试歌曲')).toBeTruthy();
    const constants = { EZ: '3.0', HD: '8.0', IN: '12.0', AT: '15.0' } as const;
    for (const difficulty of ['EZ', 'HD', 'IN', 'AT'] as const) {
      expect(screen.queryByText(difficulty)).toBeNull();
      expect(screen.queryByText(`${difficulty} 12`)).toBeNull();
      expect(screen.getByTestId(`rizline-difficulty-${difficulty}`).props.accessibilityLabel)
        .toBe(`${difficulty} ${constants[difficulty]}`);
      expect(screen.getByText(constants[difficulty])).toBeTruthy();
    }
    expect(screen.queryByText('12')).toBeNull();
  });

  it('shows a dash on SP catalog badges that have no constant', async () => {
    const screen = await render(<RizlineSongRow song={rizlineSong({ charts: [rizlineChart('SP', null)] })} />);
    expect(screen.queryByText('?')).toBeNull();
    expect(screen.queryByText('SP')).toBeNull();
    expect(screen.getByTestId('rizline-difficulty-SP').props.accessibilityLabel).toBe('SP —');
    expect(screen.getByText('—')).toBeTruthy();
  });

  it.each<{ achievements: number; ahStatus: RizlineRecord['ahStatus']; status: 'ap' | 'ah' | 'normal' }>([
    { achievements: 119.123456, ahStatus: 'inferred', status: 'ah' },
    { achievements: 119.999999, ahStatus: 'inferred', status: 'ah' },
    { achievements: 120, ahStatus: 'inferred', status: 'ap' },
    { achievements: 120, ahStatus: 'unknown', status: 'ap' },
    { achievements: 120.00000762939453, ahStatus: 'inferred', status: 'ap' },
    { achievements: 120.00000762939453, ahStatus: 'unknown', status: 'ap' },
    { achievements: 119.999999, ahStatus: 'unknown', status: 'normal' },
    { achievements: 119.123456, ahStatus: 'incompatible', status: 'normal' },
  ])('shares $status badges and flowing accuracy between cards and detail at $achievements with $ahStatus AH', async ({ achievements, ahStatus, status }) => {
    mockRecords = [rizlineRecord(undefined, { achievements, ap: achievements === 120, ahStatus })];
    for (const content of [<RizlineScoreCard key="score" record={mockRecords[0]!} />, <RizlineSongDetail key="detail" songId="song.a" />]) {
      const screen = await render(content);
      const card = within(screen.queryByTestId('rizline-chart-IN') ?? screen.getByTestId('rizline-score-song.a.IN'));
      if (status === 'normal') {
        expect(card.queryByText('AH')).toBeNull(); expect(card.queryByText('AP')).toBeNull();
        expect(card.queryByTestId(/^rizline-flowing-accuracy-/)).toBeNull();
      } else {
        expect(card.getByText(status.toUpperCase())).toBeTruthy();
        expect(card.queryByText(status === 'ap' ? 'AH' : 'AP')).toBeNull();
        expect(card.getByTestId(`rizline-status-${status}`).props.colors).toEqual(
          (status === 'ap' ? BADGE_GOLD_BORDER_COLORS : METRIC_GRADIENT_THEMES.mint.baseColors).map(processColor),
        );
        expect(card.getByTestId(`rizline-flowing-accuracy-${status}`)).toBeTruthy();
        expect(card.getByTestId(`rizline-flowing-accuracy-${status}-gradient`).props.colors)
          .toEqual(METRIC_GRADIENT_THEMES[status === 'ap' ? 'gold' : 'mint'].colors.map(processColor));
        expect(Animated.timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
          duration: METRIC_GRADIENT_THEMES[status === 'ap' ? 'gold' : 'mint'].duration, isInteraction: false,
        }));
      }
      await cleanup();
    }
  });

  it('draws from the filtered charts and shows its matching score', async () => {
    const screen = await render(<RizlineRandomChartsScreen />);
    expect(screen.getByText('候选谱面 1 条')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('random-charts-draw'));
    expect(screen.getByTestId('rizline-score-song.a.IN')).toBeTruthy();
    expect(screen.getByText('119.1235%')).toBeTruthy();
  });

  it('opens an independent SP practice entry from my library at its stable index', async () => {
    mockSong = rizlineSong({ id: 'song.a.sp', title: '独立 SP 歌曲', charts: [rizlineChart('SP', null, 'song.a.sp')] });
    mockLibraryItems = [{ key: 'chart:rizline:song.a.sp:SD:4', gameId: 'rizline', kind: 'chart', songId: 'song.a.sp', type: 'SD', levelIndex: 4,
      practice: true, tags: ['交互'], createdAt: '2026-09-13', updatedAt: '2026-09-13' }];
    const screen = await render(<UserLibraryScreen />);
    expect(screen.getByText('练习谱面 · SP ?')).toBeTruthy();
    expect(screen.queryByText(/曲库暂不可用/)).toBeNull();
    await fireEvent.press(screen.getByText('独立 SP 歌曲'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/songs/[songId]', params: { songId: 'song.a.sp', chartType: 'SD', levelIndex: '4' } });
  });

  it('waits for scores then preserves random draws with unknown metrics after a read failure', async () => {
    mockGameDataState = { hasData: false, isLoading: true, isError: false };
    const screen = await render(<RizlineRandomChartsScreen />);
    expect(screen.getByText('正在读取成绩…')).toBeTruthy();
    expect(screen.getByTestId('random-charts-draw').props.accessibilityState.disabled).toBe(true);
    mockGameDataState = { hasData: false, isLoading: false, isError: true };
    await screen.rerender(<RizlineRandomChartsScreen />);
    expect(screen.getByText(/成绩暂不可用/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('random-charts-draw'));
    expect(within(screen.getByTestId('rizline-score-song.a.IN')).getAllByText('—')).toHaveLength(2);
    expect(screen.queryByText('未游玩')).toBeNull();
  });
});
