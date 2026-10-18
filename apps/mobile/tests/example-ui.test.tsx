import { cleanup, fireEvent, render, within, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { Animated } from 'react-native';
import { ExampleSongDetail } from '@/components/example/ExampleSongDetail';
import { ExampleScoreCard } from '@/components/example/ExampleSongContent';
import { ExampleBestScreen, ExampleCatalogScreen, ExampleRecordsScreen } from '@/screens/ExampleScreens';
import { ExampleRandomChartsScreen, ExampleStrengthAnalysisScreen } from '@/screens/ExampleToolScreens';
import { DxRatingCard } from '@/components/DxRatingCard';
import { overviewRatingCard } from '@/features/game-content/adapters/overview-presentation';
import { exampleTestPayload } from '@/providers/example-test-provider';
import { getGameProfile } from '@/domain/game-profile';
import { useThemeStore } from '@/state/theme-store';
import { AppThemeProvider } from '@/theme/app-theme';

const mockPush = jest.fn(); const mockFavorite = jest.fn(async (..._args: unknown[]) => undefined);
const mockPractice = jest.fn(async (..._args: unknown[]) => undefined); const mockTags = jest.fn(async (..._args: unknown[]) => undefined);
const mockPayload = exampleTestPayload();
jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, router: { push: (...args: unknown[]) => mockPush(...args) },
  useNavigation: () => ({ canGoBack: () => true, goBack: jest.fn() }) }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-file-system', () => jest.requireActual<typeof import('./remote-image-native-mock')>('./remote-image-native-mock').fileSystem);
jest.mock('expo-file-system/legacy', () => jest.requireActual<typeof import('./remote-image-native-mock')>('./remote-image-native-mock').legacyFileSystem);
jest.mock('expo-image', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return { Image: (props: React.ComponentProps<typeof RN.Image>) => <RN.Image {...props} testID="native-image" /> };
});
jest.mock('react-native-gesture-handler', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return { GestureHandlerRootView: RN.View, Pressable: RN.Pressable, ScrollView: RN.ScrollView };
});
jest.mock('react-native-safe-area-context', () => ({
  ...(jest.requireActual('react-native-safe-area-context') as object), useSafeAreaInsets: () => ({ top: 20, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/hooks/use-native-tab-bottom-inset', () => ({ useNativeTabBottomInset: () => 0 }));
jest.mock('@/components/AppNotification', () => ({ NotificationOutlet: () => null, useNotificationModalRequestClose: () => () => false }));
jest.mock('@/hooks/use-game-data', () => ({ useGameData: () => ({ data: { payload: mockPayload }, isPending: false, isFetching: false, isError: false, refetch: jest.fn() }) }));
jest.mock('@/hooks/use-user-library', () => ({ useUserLibrary: () => ({
  data: [], isLoading: false, isUpdating: false, tagPresets: [],
  setSongFavorite: (...args: unknown[]) => mockFavorite(...args), setChartPractice: (...args: unknown[]) => mockPractice(...args),
  setTags: (...args: unknown[]) => mockTags(...args), setTagPresets: jest.fn(),
  songKey: (id: string) => `song:example:${id}`, chartKey: (id: string) => `chart:example:${id}:SD:0`,
}) }));

beforeEach(() => {
  jest.clearAllMocks();
  useThemeStore.setState({ appearance: 'light', scoreCardArtworkEnabled: false });
  jest.spyOn(Animated, 'loop').mockReturnValue({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() });
});
afterEach(async () => { await cleanup(); jest.restoreAllMocks(); });

it.each(['light', 'dark'] as const)('shows the requested overview and score information in %s appearance', async appearance => {
  useThemeStore.setState({ appearance });
  const view = await render(<AppThemeProvider><DxRatingCard {...overviewRatingCard({ gameId: 'example', providerId: 'example-test', profile: getGameProfile('example'), payload: mockPayload })} />
    <ExampleScoreCard record={mockPayload.records[0]} /></AppThemeProvider>);
  for (const text of ['EXAMPLE RATING', '19000', 'Best 30 14250 · Ranked 10 4750', 'EX RANK', 'ʐ', 'EXAMPLE SONG', 'Score', 'Insane 27.5', 'EX', 'Rating', '475']) expect(view.getByText(text)).toBeTruthy();
  expect(view.getAllByText('1000000').length).toBeGreaterThan(0);
  await fireEvent.press(view.getByTestId('example-record-0001'));
  expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/songs/[songId]', params: { gameId: 'example', songId: '0001', levelIndex: '0' } });
});

it('shows both best groups and records without search, while the catalog searches names and zero-padded IDs', async () => {
  const best = await render(<ExampleBestScreen />);
  expect(best.getByText('Best 30')).toBeTruthy();
  expect(best.queryByPlaceholderText(/搜索/)).toBeNull();
  await cleanup();
  const records = await render(<ExampleRecordsScreen />);
  expect(records.getByTestId('example-record-0001')).toBeTruthy();
  expect(records.queryByPlaceholderText(/搜索/)).toBeNull();
  await cleanup();
  const catalog = await render(<ExampleCatalogScreen />);
  await fireEvent.changeText(catalog.getByPlaceholderText('搜索曲名或 ID'), '0040');
  expect(catalog.getByText('ID0040 · 颍川ホコリ')).toBeTruthy();
  expect(catalog.queryByText('ID0001 · 颍川ホコリ')).toBeNull();
  await fireEvent.press(catalog.getByText('EXAMPLE SONG'));
  expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/songs/[songId]', params: { gameId: 'example', songId: '0040' } });
  await fireEvent.changeText(catalog.getByPlaceholderText('搜索曲名或 ID'), 'example song');
  expect(catalog.getAllByText('EXAMPLE SONG').length).toBeGreaterThan(1);
});

it('opens the actual song and writes favorite, practice and each tag scope independently', async () => {
  const detail = await render(<ExampleSongDetail songId="0040" />);
  for (const text of ['ID0040', '颍川ホコリ', '流行', '120', 'EXAMPLE', 'Insane 27.5']) expect(detail.getAllByText(text).length).toBeGreaterThan(0);
  await fireEvent.press(detail.getByLabelText('收藏 EXAMPLE SONG'));
  expect(mockFavorite).toHaveBeenLastCalledWith('0040', true);
  await fireEvent.press(detail.getByText('加入练习清单'));
  expect(mockPractice).toHaveBeenLastCalledWith('0040', 'SD', 0, true);
  for (const scope of ['song', 'chart']) {
    const editor = within(detail.getByTestId(`example-${scope}-tags`));
    await fireEvent.changeText(editor.getByPlaceholderText('输入标签'), `${scope}标签`);
    await fireEvent.press(editor.getByText('添加'));
    await waitFor(() => expect(mockTags).toHaveBeenLastCalledWith(scope === 'song' ? { kind: 'song', songId: '0040' }
      : { kind: 'chart', songId: '0040', type: 'SD', levelIndex: 0 }, [`${scope}标签`]));
  }
  await fireEvent(detail.getByTestId('native-image'), 'error', { nativeEvent: { error: 'image unavailable' } });
  await waitFor(() => expect(detail.getByText('♪')).toBeTruthy());
  expect(detail.getByText('ID0040')).toBeTruthy();
});

it('draws the selected count without duplicates and navigates from radar support and endurance recommendations', async () => {
  const random = await render(<ExampleRandomChartsScreen />);
  expect(random.queryByTestId('random-charts-filter')).toBeNull();
  await fireEvent.press(random.getByText('抽取'));
  expect(random.getAllByTestId(/^example-record-/)).toHaveLength(1);
  await fireEvent.press(random.getByLabelText('抽取 4 首'));
  await fireEvent.press(random.getByText('再抽一次'));
  const cards = random.getAllByTestId(/^example-record-/);
  expect(cards).toHaveLength(4); expect(new Set(cards.map(card => card.props.testID)).size).toBe(4);
  await cleanup();
  const strength = await render(<ExampleStrengthAnalysisScreen />);
  expect(strength.getByText('精度突出，耐力待提升')).toBeTruthy();
  expect(strength.getAllByTestId(/^example-record-/).map(card => card.props.testID)).toEqual(['example-record-0038', 'example-record-0039', 'example-record-0040']);
  await fireEvent.press(strength.getByTestId('example-record-0040'));
  expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/songs/[songId]', params: { gameId: 'example', songId: '0040', levelIndex: '0' } });
  await fireEvent.press(strength.getByTestId('simai-difficulty-radar-axis-example-3'));
  expect(strength.getByText('耐力 · 8.4')).toBeTruthy();
  await fireEvent.press(strength.getByTestId('example-record-0001'));
  expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/songs/[songId]', params: { gameId: 'example', songId: '0001', levelIndex: '0' } });
  expect(strength.queryByText('完成')).toBeNull();
});
