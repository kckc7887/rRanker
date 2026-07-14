import type { ReactNode } from 'react';
import { fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { Animated } from 'react-native';
import SearchScreen from '../app/(tabs)/search';
import SongDetailScreen from '../app/songs/[songId]';

jest.spyOn(Animated, 'loop').mockReturnValue({
  start: jest.fn(), stop: jest.fn(), reset: jest.fn(),
} as unknown as ReturnType<typeof Animated.loop>);

const mockSetSongFavorite = jest.fn();
let mockSongRouteParams: { songId: string; chartType?: string; levelIndex?: string } = { songId: '1' };

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-gesture-handler', () => {
  const RN = require('react-native');
  return { ScrollView: RN.ScrollView, GestureHandlerRootView: RN.View };
});
jest.mock('react-native-safe-area-context', () => ({
  ...(jest.requireActual('react-native-safe-area-context') as object),
  useSafeAreaInsets: () => ({ top: 47, right: 0, bottom: 34, left: 0 }),
}));
jest.mock('expo-router', () => ({
  Stack: { Screen: ({ options }: { options?: { headerRight?: () => ReactNode } }) => options?.headerRight?.() ?? null },
  router: { push: jest.fn() }, useLocalSearchParams: () => mockSongRouteParams,
}));
jest.mock('@/components/SongCover', () => ({ SongCover: () => null }));
jest.mock('@/hooks/use-detailed-catalog', () => ({ useDetailedCatalog: () => {
  const fixtures = jest.requireActual<typeof import('../src/fixtures/sanitized')>('../src/fixtures/sanitized');
  return { data: { ...fixtures.fixtureCatalog, songs: fixtures.fixtureCatalog.songs.map((song: { id: string }) => song.id === '1' ? {
    ...song, aliases: ['唯一别名', '这是用于验证超出一行后才会出现展开按钮的很长很长别名'], version: '舞萌DX 2026', versionId: undefined,
    genre: 'POPS＆ANIME', bpm: 180, region: '未来都市',
    charts: [
      { songId: '1', type: 'DX', levelIndex: 0, level: '6', difficulty: 'basic', difficultyConstant: 6.0 },
      { songId: '1', type: 'DX', levelIndex: 1, level: '9', difficulty: 'advanced', difficultyConstant: 9.0 },
      { songId: '1', type: 'DX', levelIndex: 2, level: '12', difficulty: 'expert', difficultyConstant: 12.0 },
      { songId: '1', type: 'DX', levelIndex: 3, level: '13+', difficulty: 'master', difficultyConstant: 13.6,
        charter: 'DX主谱师', versionId: 25500,
        notes: { tap: 500, hold: 100, slide: 120, touch: 80, break: 20, total: 820 } },
      { songId: '1', type: 'DX', levelIndex: 4, level: '14+', difficulty: 'remaster', difficultyConstant: 14.7 },
      { songId: '1', type: 'SD', levelIndex: 0, level: '5', difficulty: 'basic', difficultyConstant: 5.0, charter: 'SD基础谱师' },
      { songId: '1', type: 'SD', levelIndex: 3, level: '12+', difficulty: 'master', difficultyConstant: 12.8, charter: 'SD主谱师' },
    ],
  } : song) }, isLoading: false, isError: false, error: null, refetch: jest.fn() };
} }));
jest.mock('@/hooks/use-score-snapshot', () => ({ useScoreSnapshot: () => {
  const fixtures = jest.requireActual<typeof import('../src/fixtures/sanitized')>('../src/fixtures/sanitized');
  const base = fixtures.fixtureRecords[0];
  const visualRecords = [
    { ...base, songId: '1', levelIndex: 0, difficulty: 'basic', achievements: 98.5, rating: 100, rate: 'sp', fc: 'fc', fs: 'sync' },
    { ...base, songId: '1', levelIndex: 1, difficulty: 'advanced', achievements: 99, rating: 120, rate: 'ss', fc: 'fcp', fs: 'fs' },
    { ...base, songId: '1', levelIndex: 2, difficulty: 'expert', achievements: 99.5, rating: 140, rate: 'ssp', fc: 'ap', fs: 'fsd' },
    { ...base, songId: '1', levelIndex: 3, difficulty: 'master', achievements: 99.9999, rating: 160, rate: 'sss', fc: 'app', fs: 'fsdp' },
    { ...base, songId: '1', levelIndex: 4, difficulty: 'remaster', achievements: 100.5, rating: 180, rate: 'sssp', fc: null, fs: null },
  ];
  return { data: { records: [...fixtures.fixtureRecords, ...visualRecords], source: fixtures.fixtureSource }, isLoading: false, isError: false, error: null, refetch: jest.fn() };
} }));
jest.mock('@/hooks/use-user-library', () => ({ useUserLibrary: () => ({
  data: [], isLoading: false, isUpdating: false, setSongFavorite: mockSetSongFavorite, setChartPractice: jest.fn(), setTags: jest.fn(),
}) }));

describe('M2 song query screens', () => {
  beforeEach(() => { mockSongRouteParams = { songId: '1' }; jest.clearAllMocks(); });

  it('searches aliases after debounce and supports empty filter state', async () => {
    const screen = await render(<SearchScreen />);
    await fireEvent.changeText(screen.getByLabelText('歌曲搜索'), '完全不存在');
    await waitFor(() => expect(screen.getByText('筛选结果为空')).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText('歌曲搜索'), '唯一别名');
    await waitFor(() => expect(screen.getAllByText('正常曲目 A').length).toBeGreaterThan(0));
  });
  it('renders song metadata, chart status and source status', async () => {
    const screen = await render(<SongDetailScreen />);
    expect(screen.getByText('歌曲信息')).toBeTruthy();
    expect(screen.getAllByText(/别名：唯一别名/).length).toBeGreaterThan(0);
    expect(screen.getByText('#1')).toBeTruthy();
    expect(screen.getByText('POPS＆ANIME')).toBeTruthy();
    expect(screen.getAllByText('180').length).toBeGreaterThan(0);
    expect(screen.getByText('未来都市')).toBeTruthy();
    expect(screen.getByText('版本')).toBeTruthy();
    expect(screen.getByText('舞萌DX 2026')).toBeTruthy();
    expect(screen.queryByText(/国服|日服/)).toBeNull();
    await fireEvent.press(screen.getByLabelText('切换版本名称'));
    expect(screen.getByText('maimai でらっくす PRiSM PLUS')).toBeTruthy();
    expect(screen.getByLabelText('切换版本名称')).toBeTruthy();
    expect(screen.getByLabelText('数据来源状态')).toBeTruthy();
    expect(screen.getByLabelText('难度卡片').props.contentOffset.x).toBeGreaterThan(0);
    const difficulties = screen.getAllByText(/Re:MASTER|MASTER|EXPERT|ADVANCED|BASIC/).map((node) =>
      Array.isArray(node.props.children) ? node.props.children.join('') : node.props.children);
    expect(difficulties).toEqual(['Re:MASTER', 'MASTER', 'EXPERT', 'ADVANCED', 'BASIC']);
    expect(screen.getByLabelText('100.5000%')).toBeTruthy();
    expect(screen.getByTestId('flowing-achievement')).toBeTruthy();
    expect(screen.getByTestId('rainbow-achievement')).toBeTruthy();
    expect(screen.getByLabelText('99.9999%')).toBeTruthy();
    expect(screen.getByLabelText('99.5000%')).toBeTruthy();
    expect(screen.getByLabelText('99.0000%')).toBeTruthy();
    expect(screen.getByText('AP+')).toBeTruthy();
    expect(screen.getByText('FDX+')).toBeTruthy();
    expect(screen.getByTestId('flowing-status-AP+')).toBeTruthy();
    expect(screen.getByTestId('flowing-status-FDX+')).toBeTruthy();
    expect(screen.getByText('FC')).toBeTruthy();
    expect(screen.getByText('SYNC')).toBeTruthy();
    expect(screen.getByText('SSS+')).toBeTruthy();
    expect(screen.getByText('SSS')).toBeTruthy();
    expect(screen.getByText('SS+')).toBeTruthy();
    expect(screen.getByText('SS')).toBeTruthy();
    expect(screen.getByText('S+')).toBeTruthy();
    expect(screen.getByTestId('flowing-rate-SSS+')).toBeTruthy();
    expect(screen.getByTestId('rainbow-rate-SSS')).toBeTruthy();
    expect(screen.getByTestId('flowing-rate-SS+')).toBeTruthy();
    expect(screen.getByTestId('near-miss-badge')).toBeTruthy();
    expect(screen.queryByText(/定数 13\.6/)).toBeNull();
    expect(screen.getByText('13.6')).toBeTruthy();
    expect(screen.getByText('谱师：DX主谱师')).toBeTruthy();
    expect(screen.queryByText('谱师：SD主谱师')).toBeNull();
    expect(screen.queryByText(/谱面版本/)).toBeNull();
    const notesTable = within(screen.getByLabelText('谱面物量'));
    for (const heading of ['TAP', 'HOLD', 'SLIDE', 'TOUCH', 'BREAK', '总计']) {
      expect(notesTable.getByText(heading)).toBeTruthy();
    }
    for (const value of ['500', '100', '120', '80', '20', '820']) {
      expect(notesTable.getByText(value)).toBeTruthy();
    }

    expect(screen.getAllByText('·点击切换·')).toHaveLength(5);
    await fireEvent.press(screen.getAllByLabelText('切换为SD谱面')[0]);
    expect(screen.queryByText('谱师：DX主谱师')).toBeNull();
    expect(screen.getByText('谱师：SD主谱师')).toBeTruthy();
    expect(screen.getAllByText('·点击切换·')).toHaveLength(2);
    expect(screen.getAllByText(/Re:MASTER|MASTER|EXPERT|ADVANCED|BASIC/).map((node) =>
      Array.isArray(node.props.children) ? node.props.children.join('') : node.props.children))
      .toEqual(['MASTER', 'BASIC']);

    await fireEvent.press(screen.getByLabelText('收藏 正常曲目 A'));
    expect(mockSetSongFavorite).toHaveBeenCalledWith('1', true);

    await fireEvent(screen.getByTestId('alias-overflow-measure'), 'textLayout', { nativeEvent: { lines: [{}, {}] } });
    await fireEvent.press(screen.getByLabelText('展开别名'));
    expect(screen.getByTestId('song-alias-text').props.numberOfLines).toBeUndefined();
    await fireEvent.press(screen.getByLabelText('收起别名'));
    expect(screen.getByTestId('song-alias-text').props.numberOfLines).toBe(1);
  });

  it('opens the chart type and exact difficulty supplied by a score card', async () => {
    mockSongRouteParams = { songId: '1', chartType: 'SD', levelIndex: '0' };
    const screen = await render(<SongDetailScreen />);

    expect(screen.getByText('谱师：SD基础谱师')).toBeTruthy();
    expect(screen.queryByText('谱师：DX主谱师')).toBeNull();
    expect(screen.getByLabelText('难度卡片').props.contentOffset.x).toBeGreaterThan(0);
    expect(screen.getAllByText(/MASTER|BASIC/).map((node) =>
      Array.isArray(node.props.children) ? node.props.children.join('') : node.props.children))
      .toEqual(['MASTER', 'BASIC']);
  });
});
