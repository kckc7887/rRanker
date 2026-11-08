import { act, cleanup, fireEvent, render, within, waitFor } from '@testing-library/react-native';
import { setDisabledPlugins } from '@rranker/sdk';
import { adapter as exampleAdapter } from '@rranker/game-example';
import { jest } from '@jest/globals';
import { Animated } from 'react-native';
import { ExampleSongDetail } from '@rranker/game-example/components/ExampleSongDetail';
import { ExampleScoreCard } from '@rranker/game-example/components/ExampleSongContent';
import { ExampleBestScreen, ExampleCatalogScreen, ExampleRecordsScreen } from '@rranker/game-example/screens/ExampleScreens';
import { ExampleRandomChartsScreen, ExampleStrengthAnalysisScreen } from '@rranker/tool-example/screens/ExampleToolScreens';
import { RatingCard } from '@rranker/sdk/components/RatingCard';
import { presentOverview } from '@rranker/game-example/screens/OverviewPage';
import { exampleTestPayload } from '@rranker/provider-example-test/providers/example-test-provider';
import { getGameProfile } from '@rranker/sdk/domain/game-profile';
import { useThemeStore } from '@rranker/sdk/state/theme-store';
import { AppThemeProvider } from '@rranker/sdk/theme/app-theme';

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
jest.mock('@rranker/sdk/hooks/use-native-tab-bottom-inset', () => ({ useNativeTabBottomInset: () => 0 }));
jest.mock('@rranker/sdk/components/AppNotification', () => ({ NotificationOutlet: () => null, useNotificationModalRequestClose: () => () => false }));
jest.mock('@rranker/sdk/hooks/use-game-data', () => ({ useGameData: () => ({ data: { payload: mockPayload }, isPending: false, isFetching: false, isError: false, refetch: jest.fn() }) }));
jest.mock('@rranker/sdk/hooks/use-user-library', () => ({ useUserLibrary: () => ({
  data: [], isLoading: false, isUpdating: false, tagPresets: [],
  setSongFavorite: (...args: unknown[]) => mockFavorite(...args), setChartPractice: (...args: unknown[]) => mockPractice(...args),
  setTags: (...args: unknown[]) => mockTags(...args), setTagPresets: jest.fn(),
  key: (target: { gameId: string; kind: string; id: string }) => JSON.stringify([target.gameId, target.kind, target.id]),
}) }));

beforeEach(() => {
  jest.clearAllMocks();
  setDisabledPlugins([]);
  useThemeStore.setState({ appearance: 'light', scoreCardArtworkEnabled: false });
  jest.spyOn(Animated, 'loop').mockReturnValue({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() });
});
afterEach(async () => { await cleanup(); setDisabledPlugins([]); jest.restoreAllMocks(); });

it('loads the tool contribution from the adapter detail and removes it when its plugin is disabled', async () => {
  const DetailPage = exampleAdapter.pages.detail;
  const detail = await render(<DetailPage gameId="example" params={{ songId: '0040', levelIndex: '0' }} />);
  await fireEvent.press(detail.getByText('查看实力分析'));
  expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/plugins/[pluginId]/[pageId]',
    params: { pluginId: 'tool.example', pageId: 'strength-analysis', gameId: 'example' } });
  await act(async () => setDisabledPlugins(['tool.example']));
  expect(detail.queryByText('查看实力分析')).toBeNull();
  expect(detail.getByText('加入练习清单')).toBeTruthy();
  await act(async () => setDisabledPlugins([]));
  expect(detail.getByText('查看实力分析')).toBeTruthy();
  await act(async () => setDisabledPlugins(['game.example']));
  expect(detail.queryByText('查看实力分析')).toBeNull();
});

it.each(['light', 'dark'] as const)('shows the requested overview and score information in %s appearance', async appearance => {
  useThemeStore.setState({ appearance });
  const view = await render(<AppThemeProvider><RatingCard {...presentOverview({ gameId: 'example', providerId: 'example-test', profile: getGameProfile('example'), payload: mockPayload }).ratingCard!} />
    <ExampleScoreCard record={mockPayload.records[0]} /></AppThemeProvider>);
  for (const text of ['EXAMPLE RATING', '19000', 'Best 30 14250 · Ranked 10 4750', 'EX RANK', 'ʐ', 'EXAMPLE SONG', 'Score', 'Insane 27.5', 'EX', 'Rating', '475']) expect(view.getByText(text)).toBeTruthy();
  expect(view.getAllByText('1000000').length).toBeGreaterThan(0);
  await fireEvent.press(view.getByTestId('example-record-0001'));
  expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/detail', params: { gameId: 'example', songId: '0001', levelIndex: '0' } });
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
  expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/detail', params: { gameId: 'example', songId: '0040' } });
  await fireEvent.changeText(catalog.getByPlaceholderText('搜索曲名或 ID'), 'example song');
  expect(catalog.getAllByText('EXAMPLE SONG').length).toBeGreaterThan(1);
});

it('opens the actual song and writes favorite, practice and each tag scope independently', async () => {
  const detail = await render(<ExampleSongDetail songId="0040" />);
  for (const text of ['ID0040', '颍川ホコリ', '流行', '120', 'EXAMPLE', 'Insane 27.5']) expect(detail.getAllByText(text).length).toBeGreaterThan(0);
  await fireEvent.press(detail.getByLabelText('收藏 EXAMPLE SONG'));
  expect(mockFavorite).toHaveBeenLastCalledWith({ gameId: 'example', kind: 'song', id: '0040', target: { songId: '0040' } }, true);
  await fireEvent.press(detail.getByText('加入练习清单'));
  expect(mockPractice).toHaveBeenLastCalledWith({ gameId: 'example', kind: 'chart', id: JSON.stringify(['0040', 0]), target: { songId: '0040', levelIndex: '0' } }, true);
  for (const scope of ['song', 'chart']) {
    const editor = within(detail.getByTestId(`example-${scope}-tags`));
    await fireEvent.changeText(editor.getByPlaceholderText('输入标签'), `${scope}标签`);
    await fireEvent.press(editor.getByText('添加'));
    await waitFor(() => expect(mockTags).toHaveBeenLastCalledWith(scope === 'song' ? { gameId: 'example', kind: 'song', id: '0040', target: { songId: '0040' } }
      : { gameId: 'example', kind: 'chart', id: JSON.stringify(['0040', 0]), target: { songId: '0040', levelIndex: '0' } }, [`${scope}标签`]));
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
  expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/detail', params: { gameId: 'example', songId: '0040', levelIndex: '0' } });
  await fireEvent.press(strength.getByTestId('simai-difficulty-radar-axis-example-3'));
  expect(strength.getByText('耐力 · 8.4')).toBeTruthy();
  await fireEvent.press(strength.getByTestId('example-record-0001'));
  expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/detail', params: { gameId: 'example', songId: '0001', levelIndex: '0' } });
  expect(strength.queryByText('完成')).toBeNull();
});
