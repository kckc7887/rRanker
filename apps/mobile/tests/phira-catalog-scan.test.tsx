import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PhiraCatalogScreen } from '@/screens/PhiraScreens';
import { phiraProvider } from '@/providers/phira-provider';
import { PHIRA_CATALOG_PAGE_SCAN_BUDGET, type PhiraChart, type PhiraChartPage } from '@/domain/phira';

jest.mock('@/storage/sqlite-snapshot-repository', () => ({ SqliteSnapshotRepository: class {} }));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { push: jest.fn(), back: jest.fn() },
  useNavigation: () => ({ getState: () => ({ index: 0, routes: [{ name: 'songs/[songId]' }] }) }),
  useFocusEffect: () => undefined,
}));
jest.mock('expo-image', () => ({ Image: (props: object) => { const RN = jest.requireActual<typeof import('react-native')>('react-native'); return <RN.View {...props} />; } }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children, ...props }: { children?: React.ReactNode }) => { const RN = jest.requireActual<typeof import('react-native')>('react-native'); return <RN.View {...props}>{children}</RN.View>; } }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-gesture-handler', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    GestureHandlerRootView: RN.View,
    Pressable: (props: React.ComponentProps<typeof RN.Pressable>) => React.createElement(
      RN.Pressable,
      { ...props, testID: props.testID ?? 'gesture-handler-pressable' },
    ),
    ScrollView: RN.ScrollView,
  };
});
jest.mock('@/hooks/use-native-tab-bottom-inset', () => ({ useNativeTabBottomInset: () => 0 }));
jest.mock('@/theme/app-theme', () => ({ useAppTheme: () => ({
  dark: false, background: '#F7F8FA', surface: '#FFF', surfaceMuted: '#EEF2F7', input: '#F1F3F5',
  border: '#DDD', text: '#111', textSecondary: '#4B5563', textMuted: '#666', accent: '#246BFD', danger: '#B42318',
}) }));
jest.mock('@/state/session-store', () => ({ useSession: (selector: (state: object) => unknown) => selector({ activeAccountId: 'phira:community:323528' }) }));
jest.mock('@/hooks/use-user-library', () => ({ useUserLibrary: () => ({
  data: [], tagPresets: [], isUpdating: false, songKey: (id: string) => `song:${id}`,
  setTagPresets: jest.fn(), setTags: jest.fn(), setSongFavorite: jest.fn(),
}) }));
jest.mock('@/components/AppNotification', () => ({ useNotification: () => ({
  dismissNotification: jest.fn(), showNotification: jest.fn(),
  showActionNotification: jest.fn(), updateNotification: jest.fn(),
}) }));
jest.mock('@/hooks/use-game-data', () => ({ useGameData: () => ({
  data: undefined, isLoading: false, isError: false, error: null, refetch: jest.fn(),
}) }));
jest.mock('@/features/phira-compatible-chart-download/phira-compatible-chart-download', () => ({
  downloadPhiraChartPackage: jest.fn(),
}));
jest.mock('@/features/chart-download-shared/use-chart-package-download', () => ({
  useChartPackageDownload: () => ({ isRunning: false, start: jest.fn() }),
}));
jest.mock('@/components/TagEditor', () => ({ TagEditor: () => null }));
jest.mock('@/components/game-content/SongDetailChrome', () => ({ SongDetailChrome: () => null }));

/** 高于筛选上限 16 的定数：把每一页都筛空，得到「翻页有数据但筛选结果为空」的真实场景。 */
const FILTERED_OUT_DIFFICULTY = 16.2;
const chart = (id: number): PhiraChart => ({
  id, name: `Chart ${id}`, level: 'AT Lv.16', difficulty: FILTERED_OUT_DIFFICULTY,
  charter: '', composer: '', illustrator: null, description: null, ranked: true, stable: true,
  reviewed: true, illustration: null, preview: null, file: null, uploader: 1, tags: [],
  rating: null, ratingCount: 0, created: null, updated: null, chartUpdated: null,
});
const page = (pageNumber: number): PhiraChartPage => ({
  results: Array.from({ length: 30 }, (_, index) => chart(pageNumber * 100 + index + 1)),
  total: 4000,
});
const EXPECTED_PAGES_UNTIL_BUDGET = [0, 2, 3, 4, 5, 6, 7, 8];
const clients: QueryClient[] = [];

function createClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return client;
}

function renderCatalog(client = createClient()) {
  return render(<QueryClientProvider client={client}><PhiraCatalogScreen /></QueryClientProvider>);
}

/** 通过定数上限把曲目全部筛掉，触发空结果自动续扫。 */
async function filterOutEveryChart(screen: Awaited<ReturnType<typeof renderCatalog>>) {
  await fireEvent.press(screen.getByLabelText(/展开筛选/));
  const track = screen.getByTestId('phigros-filter-constant-track');
  await fireEvent(track, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 100, height: 36 } } });
  await fireEvent.press(track, { nativeEvent: { locationX: 80 } });
}

describe('Phira 曲库自动续扫（真实组件 + 真实无限查询）', () => {
  afterEach(async () => {
    await cleanup();
    clients.splice(0).forEach((client) => client.clear());
    jest.restoreAllMocks();
  });

  it('立即完成的后页也逐页推进到扫描预算，不会停在第 2 页的加载中', async () => {
    const requested: number[] = [];
    jest.spyOn(phiraProvider, 'getCharts').mockImplementation(async (input) => {
      requested.push(input.page);
      return page(input.page);
    });

    const screen = await renderCatalog();
    await filterOutEveryChart(screen);

    await waitFor(() => expect(requested).toEqual(EXPECTED_PAGES_UNTIL_BUDGET), { timeout: 3000 });
    // 预算耗尽：给出继续入口，而不是一直显示加载中。
    await waitFor(() => expect(screen.getByLabelText('继续扫描')).toBeTruthy(), { timeout: 3000 });
    await waitFor(
      () => expect(screen.getByText(`已扫描 ${PHIRA_CATALOG_PAGE_SCAN_BUDGET} 页仍无匹配谱面`)).toBeTruthy(),
      { timeout: 3000 },
    );
    await screen.unmount();
  });

  it('延迟到达的后页同样逐页推进', async () => {
    const requested: number[] = [];
    jest.spyOn(phiraProvider, 'getCharts').mockImplementation(async (input) => {
      requested.push(input.page);
      await new Promise((resolve) => setTimeout(resolve, 0));
      return page(input.page);
    });

    const screen = await renderCatalog();
    await filterOutEveryChart(screen);

    await waitFor(() => expect(requested).toEqual(EXPECTED_PAGES_UNTIL_BUDGET), { timeout: 5000 });
    await waitFor(() => expect(screen.getByLabelText('继续扫描')).toBeTruthy(), { timeout: 3000 });
    await screen.unmount();
  });

  it('不会并发重复请求同一页', async () => {
    const requested: number[] = [];
    const inFlight = new Map<number, number>();
    let maxSamePage = 0;
    jest.spyOn(phiraProvider, 'getCharts').mockImplementation(async (input) => {
      const running = (inFlight.get(input.page) ?? 0) + 1;
      inFlight.set(input.page, running);
      maxSamePage = Math.max(maxSamePage, running);
      await Promise.resolve();
      inFlight.set(input.page, running - 1);
      requested.push(input.page);
      return page(input.page);
    });

    const screen = await renderCatalog();
    await filterOutEveryChart(screen);

    await waitFor(() => expect(requested).toEqual(EXPECTED_PAGES_UNTIL_BUDGET), { timeout: 3000 });
    expect(maxSamePage).toBe(1);
    expect(new Set(requested).size).toBe(requested.length);
    await screen.unmount();
  });

  it('预算耗尽后继续扫描按实际页数显示上限文案', async () => {
    const requested: number[] = [];
    jest.spyOn(phiraProvider, 'getCharts').mockImplementation(async (input) => {
      requested.push(input.page);
      return page(input.page);
    });

    const screen = await renderCatalog();
    await filterOutEveryChart(screen);
    await waitFor(() => expect(requested).toEqual(EXPECTED_PAGES_UNTIL_BUDGET), { timeout: 3000 });

    await fireEvent.press(screen.getByLabelText('继续扫描'));
    await waitFor(() => expect(requested).toEqual([...EXPECTED_PAGES_UNTIL_BUDGET, 9]), { timeout: 3000 });
    await waitFor(
      () => expect(screen.getByText('已扫描 9 页仍无匹配谱面')).toBeTruthy(),
      { timeout: 3000 },
    );
    await screen.unmount();
  });

  it('后页失败停止自动扫描并给出重试入口，重试成功后继续推进', async () => {
    const requested: number[] = [];
    jest.spyOn(phiraProvider, 'getCharts').mockImplementation(async (input) => {
      requested.push(input.page);
      if (requested.length === 3) throw new Error('boom');
      return page(input.page);
    });

    const screen = await renderCatalog();
    await filterOutEveryChart(screen);

    await waitFor(() => expect(requested).toEqual([0, 2, 3]), { timeout: 3000 });
    await waitFor(() => expect(screen.getByLabelText('重试加载后页')).toBeTruthy(), { timeout: 3000 });
    expect(requested).toEqual([0, 2, 3]);

    await fireEvent.press(screen.getByLabelText('重试加载后页'));
    await waitFor(() => expect(requested.slice(0, 5)).toEqual([0, 2, 3, 3, 4]), { timeout: 3000 });
    await screen.unmount();
  });

  it('切换到页数相同的另一个缓存查询时重新判断续扫', async () => {
    const requested: string[] = [];
    // 当前查询的后页一直悬停在请求中：观察值稳定在「同一页数、仍在扫描」。
    const stalled = Promise.withResolvers<PhiraChartPage>();
    jest.spyOn(phiraProvider, 'getCharts').mockImplementation(async (input) => {
      requested.push(`${input.status}:${input.page}`);
      if (input.status === 'ranked') return stalled.promise;
      return page(input.page);
    });
    const client = createClient();
    const cached = (offset: number) => ({ pages: [page(offset), page(offset + 2)], pageParams: [0, 2] });
    client.setQueryData(['phira', 'charts', 'ranked', ''], cached(0));
    client.setQueryData(['phira', 'charts', 'special', ''], cached(10));

    const screen = await renderCatalog(client);
    await filterOutEveryChart(screen);
    await waitFor(() => expect(requested).toEqual(['ranked:3']), { timeout: 3000 });

    await fireEvent.press(screen.getByLabelText('选择谱面类别，当前 上架'));
    await fireEvent.press(screen.getByLabelText('选择谱面类别 特殊'));
    // 另一个查询按自己的位置继续推进到自己的预算，而不是继承上一个查询的请求位置。
    await waitFor(() => expect(requested).toEqual([
      'ranked:3', 'special:3', 'special:4', 'special:5', 'special:6', 'special:7', 'special:8',
    ]), { timeout: 3000 });
    expect(requested.filter((entry) => entry === 'ranked:3')).toHaveLength(1);

    await act(async () => { stalled.resolve(page(3)); });
    await screen.unmount();
  });
});
