import { act, fireEvent, render, within } from '@testing-library/react-native';
import { Animated, Dimensions, InteractionManager, StyleSheet } from 'react-native';
import { jest } from '@jest/globals';
import { MajdataSongDetail } from '@/components/majdata/MajdataSongDetail';
import { simaiSongDetailStyles } from '@/components/game-content/SimaiSongDetailStyles';
import { createAppTheme } from '@/theme/theme-tokens';
import type { MajdataSong } from '@/domain/majdata';

const mockSong: MajdataSong = {
  id: '0dff2974-9419-4290-bea9-307caa5825b7', title: '长歌曲名称 '.repeat(8), artist: '真实曲师', designer: '真实谱师', uploader: '不应展示的上传者',
  description: '真实简介', timestamp: '2026-09-01T00:00:00Z', hash: 'revision',
  levels: ['1', '3', '7', '13+', '14.5', '15', '宴'], tags: ['在线 A'], publicTags: ['在线 B'],
};
const mockPush = jest.fn(); const mockBack = jest.fn(); const mockRefetch = jest.fn();
const mockPractice = jest.fn(async () => undefined); const mockFavorite = jest.fn(async () => undefined);
const mockTags = jest.fn(async () => undefined); const mockStart = jest.fn();
let mockDark = false;
let mockSongState = 'success';
let mockNotesState = 'success';
let mockDownloadRunning = false;
const mockParsed = jest.fn((song: MajdataSong | undefined, _level: number) => ({
  data: song && mockNotesState === 'success' ? { statistics: { counts: { tap: 11, hold: 22, slide: 33, touch: 44, break: 55, mine: 66 } } } : undefined,
  isError: !!song && mockNotesState === 'error', refetch: mockRefetch,
}));
const mockLibrary = {
  data: [], tagPresets: [], isLoading: false, isUpdating: false,
  songKey: (id: string) => `song:${id}`, chartKey: (id: string, type: string, level: number) => `chart:${id}:${type}:${level}`,
  setSongFavorite: mockFavorite, setChartPractice: mockPractice, setTags: mockTags, setTagPresets: jest.fn(async () => undefined),
};

jest.mock('expo-router', () => ({ router: { push: (href: unknown) => mockPush(href), replace: jest.fn() }, useNavigation: () => ({ canGoBack: () => true, goBack: mockBack }) }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) }));
jest.mock('react-native-gesture-handler', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return { GestureHandlerRootView: RN.View, ScrollView: RN.ScrollView, Pressable: RN.Pressable };
});
jest.mock('@/theme/app-theme', () => ({ useAppTheme: () => jest.requireActual<typeof import('@/theme/theme-tokens')>('@/theme/theme-tokens').createAppTheme(mockDark ? 'dark' : 'light', '#246BFD') }));
jest.mock('@/hooks/use-majdata', () => ({
  useMajdataSong: () => ({ data: mockSongState === 'success' ? mockSong : undefined, isLoading: mockSongState === 'loading', isError: mockSongState === 'error', error: null, refetch: mockRefetch }),
  useMajdataParsedChart: (song: MajdataSong | undefined, level: number) => mockParsed(song, level), useMajdataRanking: () => ({}),
}));
jest.mock('@/hooks/use-game-data', () => ({ useGameData: () => ({ data: { payload: { kind: 'majdata-net', snapshot: { records: [{ chartInfo: mockSong, chartLevel: 4, hash: mockSong.hash, acc: { dx: 99.1234, classic: 98.5678 }, comboState: 1 }] } } } }) }));
jest.mock('@/hooks/use-user-library', () => ({ useUserLibrary: () => mockLibrary }));
jest.mock('@/features/chart-download-shared/use-chart-package-download', () => ({ useChartPackageDownload: () => ({ isRunning: mockDownloadRunning, start: mockStart }) }));
jest.mock('@/features/chart-download-shared/simai-package', () => ({ downloadSimaiPackage: jest.fn() }));
jest.mock('@/components/AppNotification', () => ({
  useNotification: () => ({ showNotification: jest.fn(), showActionNotification: jest.fn() }), useNotificationModalRequestClose: () => () => false,
}));
jest.mock('@/components/RemoteImage', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return { RemoteImage: RN.View, RemoteImagePersistenceScope: RN.View, RemoteImageActivityScope: RN.View };
});

beforeEach(() => {
  jest.clearAllMocks(); mockDark = false; mockSongState = 'success'; mockNotesState = 'success';
  Dimensions.set({ window: { width: 390, height: 844, scale: 1, fontScale: 1 } });
  mockLibrary.isUpdating = false; mockDownloadRunning = false;
  jest.spyOn(Animated, 'loop').mockReturnValue({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() } as unknown as ReturnType<typeof Animated.loop>);
  jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation(callback => {
    (callback as () => void)(); return { cancel: jest.fn() } as unknown as ReturnType<typeof InteractionManager.runAfterInteractions>;
  });
});
afterEach(() => { jest.restoreAllMocks(); });

it.each([false, true])('uses the actual hero, metadata, buttons and one tag heading per section (dark=%s)', async dark => {
  mockDark = dark;
  const screen = await render(<MajdataSongDetail songId={mockSong.id} />);
  expect(StyleSheet.flatten(screen.getAllByText(`#${mockSong.id}`)[0].props.style)).toMatchObject({ fontSize: 12 });
  const title = screen.getAllByText(mockSong.title)[0];
  expect(StyleSheet.flatten(title.props.style)).toMatchObject(StyleSheet.flatten(simaiSongDetailStyles.title));
  expect(screen.getByText('作者')).toBeTruthy(); expect(screen.getAllByText('真实谱师').length).toBeGreaterThan(0);
  expect(screen.getByText('发布时间')).toBeTruthy(); expect(screen.getByText('简介：真实简介')).toBeTruthy();
  expect(screen.queryByText('不应展示的上传者')).toBeNull(); expect(screen.queryByText(/Classic/)).toBeNull();
  expect(StyleSheet.flatten(screen.getByLabelText('返回').props.style)).toMatchObject({ width: 40, height: 40, top: 47, left: 8, zIndex: 30 });
  expect(StyleSheet.flatten(screen.getByLabelText(`收藏 ${mockSong.title}`).props.style)).toMatchObject({ width: 40, height: 40, top: 47, right: 8 });
  await fireEvent.press(screen.getByLabelText('返回')); expect(mockBack).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByLabelText(`收藏 ${mockSong.title}`)); expect(mockFavorite).toHaveBeenCalledWith(mockSong.id, true);
  for (const level of [5, 4, 3, 2, 1, 0, 6]) {
    const card = within(screen.getByTestId(`majdata-chart-card-${level}`));
    expect(card.getAllByText('本地标签')).toHaveLength(1);
  }
  expect(within(screen.getByTestId('majdata-song-local-tags')).getAllByText('本地标签')).toHaveLength(1);
  expect(screen.getAllByText('本地标签')).toHaveLength(8);
  const easyStyle = StyleSheet.flatten(screen.getByTestId('majdata-chart-card-0').props.style);
  expect(easyStyle.borderColor).toBe('#3B82F6');
  expect(easyStyle.backgroundColor).toBe(dark ? createAppTheme('dark', '#246BFD').surface : '#E8F0FE');
  await screen.unmount();
});

it('renders real seven-difficulty carousel in order and only parses the visible difficulty', async () => {
  const screen = await render(<MajdataSongDetail songId={mockSong.id} initialLevelIndex={0} />);
  const carousel = screen.getByTestId('majdata-chart-carousel');
  const cards = screen.getAllByTestId(/^majdata-chart-card-/);
  expect(cards.map(card => card.props.testID)).toEqual([5, 4, 3, 2, 1, 0, 6].map(i => `majdata-chart-card-${i}`));
  expect(carousel.props.contentOffset.x).toBe(5 * carousel.props.snapToInterval);
  expect(mockParsed.mock.calls.filter(([song]) => song).map(([, level]) => level)).toEqual([0]);
  mockParsed.mockClear();
  await fireEvent(carousel, 'momentumScrollEnd', { nativeEvent: { contentOffset: { x: 6 * carousel.props.snapToInterval } } });
  expect(mockParsed.mock.calls.filter(([song]) => song).map(([, level]) => level)).toEqual([6]);
  await screen.unmount();
});

it('defers notes and cards until existing transition scheduling finishes', async () => {
  let ready: (() => void) | undefined;
  jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation(callback => {
    ready = callback as () => void; return { cancel: jest.fn() } as unknown as ReturnType<typeof InteractionManager.runAfterInteractions>;
  });
  const screen = await render(<MajdataSongDetail songId={mockSong.id} />);
  expect(screen.getByTestId('song-detail-deferred-placeholder')).toBeTruthy(); expect(mockParsed).not.toHaveBeenCalled();
  await act(async () => ready?.()); expect(screen.getByTestId('majdata-chart-carousel')).toBeTruthy();
  await screen.unmount();
});

it('keeps the visible difficulty and notes aligned when a narrow window changes width', async () => {
  Dimensions.set({ window: { width: 320, height: 720, scale: 2, fontScale: 1 } });
  const screen = await render(<MajdataSongDetail songId={mockSong.id} />);
  expect(StyleSheet.flatten(screen.getByTestId('majdata-chart-card-5').props.style).width).toBe(280);
  const carousel = screen.getByTestId('majdata-chart-carousel');
  await fireEvent(carousel, 'momentumScrollEnd', { nativeEvent: { contentOffset: { x: 5 * carousel.props.snapToInterval } } });
  mockParsed.mockClear();
  await act(async () => Dimensions.set({ window: { width: 720, height: 320, scale: 2, fontScale: 1 } }));
  const resized = screen.getByTestId('majdata-chart-carousel');
  expect(resized.props.contentOffset.x).toBe(5 * resized.props.snapToInterval);
  expect(mockParsed.mock.calls.filter(([song]) => song).map(([, level]) => level)).toEqual([0]);
  await screen.unmount();
});

it('disables favorites, practice and download while their public actions are busy', async () => {
  mockLibrary.isUpdating = true; mockDownloadRunning = true;
  const screen = await render(<MajdataSongDetail songId={mockSong.id} />);
  const current = within(screen.getByTestId('majdata-chart-card-5'));
  await fireEvent.press(screen.getByLabelText(`收藏 ${mockSong.title}`));
  await fireEvent.press(current.getByText('加入练习清单'));
  await fireEvent.press(current.getByText('下载谱面文件'));
  expect(mockFavorite).not.toHaveBeenCalled(); expect(mockPractice).not.toHaveBeenCalled(); expect(mockStart).not.toHaveBeenCalled();
  await screen.unmount();
});

it('reports an unavailable requested difficulty without selecting or parsing a different chart', async () => {
  const screen = await render(<MajdataSongDetail songId={mockSong.id} initialLevelIndex={7} />);
  expect(screen.getByText('所选难度不可用')).toBeTruthy();
  expect(screen.queryByTestId('majdata-chart-carousel')).toBeNull(); expect(mockParsed).not.toHaveBeenCalled();
  await screen.unmount();
});

it.each(['loading', 'error'])('keeps the real back button when song data is %s', async state => {
  mockSongState = state;
  const screen = await render(<MajdataSongDetail songId={mockSong.id} />);
  await fireEvent.press(screen.getByLabelText('返回')); expect(mockBack).toHaveBeenCalled();
  expect(screen.queryByLabelText(`收藏 ${mockSong.title}`)).toBeNull();
  await screen.unmount();
});

it.each(['loading', 'error'])('uses text-only notes state with no fabricated table while %s', async state => {
  mockNotesState = state;
  const screen = await render(<MajdataSongDetail songId={mockSong.id} />);
  const current = within(screen.getByTestId('majdata-chart-card-5'));
  expect(current.queryByLabelText('谱面物量')).toBeNull();
  expect(current.getByText(state === 'loading' ? '加载物量中…' : '物量不可用')).toBeTruthy();
  if (state === 'error') { await fireEvent.press(current.getByLabelText('重试谱面物量')); expect(mockRefetch).toHaveBeenCalled(); }
  await screen.unmount();
});

it('keeps six grid columns and full UUID/index for tolerance, practice, preview and video-aware download', async () => {
  const screen = await render(<MajdataSongDetail songId={mockSong.id} />);
  const current = within(screen.getByTestId('majdata-chart-card-5'));
  const grid = current.getByLabelText('谱面物量');
  expect(StyleSheet.flatten(grid.props.style)).toMatchObject({ borderRadius: 9, overflow: 'hidden' });
  for (const text of ['TAP', 'HOLD', 'SLIDE', 'TOUCH', 'BREAK', 'MINE']) expect(current.getByText(text)).toBeTruthy();
  await fireEvent.press(current.getByLabelText('使用此谱面物量计算容错'));
  expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/tools/tolerance', params: { gameId: 'majdata-net', songId: mockSong.id, hash: 'revision', levelIndex: '5' } });
  await fireEvent.press(current.getByText('加入练习清单')); expect(mockPractice).toHaveBeenCalledWith(mockSong.id, 'SD', 5, true);
  await fireEvent.press(current.getByText('查看谱面确认'));
  expect(mockPush).toHaveBeenLastCalledWith(expect.objectContaining({ pathname: '/songs/chart-preview', params: expect.objectContaining({ songId: mockSong.id, levelIndex: '5', hash: 'revision' }) }));
  await fireEvent.press(current.getByText('下载谱面文件'));
  expect(mockStart).toHaveBeenCalledWith(expect.any(Function), { optionalVideoUrl: `https://majdata.net/api3/api/maichart/${mockSong.id}/video` });
  await screen.unmount();
});

it('saves chart tags and song tags through separate existing library identities', async () => {
  const screen = await render(<MajdataSongDetail songId={mockSong.id} />);
  const chart = within(screen.getByTestId('majdata-chart-local-tags-5'));
  await fireEvent.changeText(chart.getByLabelText('新标签'), '练习滑条'); await fireEvent.press(chart.getByLabelText('添加标签'));
  expect(mockTags).toHaveBeenLastCalledWith({ kind: 'chart', songId: mockSong.id, type: 'SD', levelIndex: 5 }, ['练习滑条']);
  const song = within(screen.getByTestId('majdata-song-local-tags'));
  await fireEvent.changeText(song.getByLabelText('新标签'), '喜欢'); await fireEvent.press(song.getByLabelText('添加标签'));
  expect(mockTags).toHaveBeenLastCalledWith({ kind: 'song', songId: mockSong.id }, ['喜欢']);
  await screen.unmount();
});
