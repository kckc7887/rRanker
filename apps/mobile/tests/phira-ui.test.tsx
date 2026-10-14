import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Platform, StyleSheet } from 'react-native';
import { CachedContentActivityScope } from '@/components/CachedTabScreen';
import { router as mockRouter } from 'expo-router';
import { PhiraRandomChartsScreen } from '@/screens/PhiraRandomChartsScreen';
import { PhiraBestScreen, PhiraCatalogScreen, PhiraRecordsScreen, PhiraSongDetailScreen } from '@/screens/PhiraScreens';
import { PHIRA_CATALOG_PAGE_SCAN_BUDGET, type PhiraChart, type PhiraChartPage } from '@/domain/phira';
import { usePhiraDemoBests } from '@/hooks/use-phira';
import { phiraProvider } from '@/providers/phira-provider';
import { resolveChartPreviewNavigation } from '@/features/chart-preview-shared/chart-preview-navigation';

const mockRefetch = jest.fn(async () => ({ data: undefined }));
const mockRefreshAll = jest.fn(async () => ({ status: 'noop', requestedCount: 0, updatedCount: 0, failedChartIds: [] }));
const mockRetryFailedBests = jest.fn(async () => ({ status: 'noop', requestedCount: 0, updatedCount: 0, failedChartIds: [] }));
const mockDismissNotification = jest.fn();
const mockShowActionNotification = jest.fn(() => 42);
const mockShowNotification = jest.fn();
const mockUpdateNotification = jest.fn();
const mockDownloadPhiraPackage = jest.fn<(
  chart: unknown,
  options: unknown,
) => Promise<boolean>>(async () => true);
const mockStartChartDownload = jest.fn(async (
  runner: (options: { signal: AbortSignal }) => Promise<boolean>,
) => runner({ signal: new AbortController().signal }));
const mockChart = {
  id: 38294, name: '初音未来的消失', level: 'AT Lv.16', difficulty: 16.2,
  charter: '谱师', composer: 'CosMo@暴走P', illustrator: '', description: '简介',
  ranked: false, stable: false, uploader: 1252389, tags: ['regular'], rating: .9, ratingCount: 10,
  created: '2025-05-18T06:02:48.727Z', updated: '2025-05-20T22:46:26.729Z', chartUpdated: null,
  illustration: null, preview: null, file: 'https://phira.example/chart.zip',
};
const mockBest = {
  chart: mockChart, poolRks: null, queriedAt: '2026-08-13T00:00:00.000Z',
  record: { id: 1, chart: mockChart.id, score: 999_000, accuracy: .999, perfect: 99, good: 1, bad: 0, miss: 0, fullCombo: true, best: true, created: null },
};
let mockBests: Record<string, typeof mockBest> = {};
let mockCatalogCharts: typeof mockChart[] = [];
let mockCatalogPages: { results: typeof mockChart[] }[] | null = null;
let mockCatalogHasNextPage = false;
let mockCatalogFetchingNextPage = false;
let mockCatalogFetchNextPageError = false;
const mockFetchCatalogNextPage = jest.fn(async () => undefined);
let mockNotesEnabled: boolean[] = [];
let mockChromeProps: {
  topInset: number;
  backStyle: (pressed: boolean) => object[];
  favoriteStyle?: (pressed: boolean) => object[];
} | null = null;

let mockStackReady = true;
let mockActualDetailQuery = false;
let mockActualDemoQueries = false;
let mockAccountId = 'phira:community:323528';
jest.mock('@/components/CachedTabScreen', () => ({
  ...jest.requireActual<typeof import('@/components/CachedTabScreen')>('@/components/CachedTabScreen'),
  useStackScreenReady: () => mockStackReady,
}));

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { push: jest.fn(), back: jest.fn() },
  useNavigation: () => ({ getState: () => ({ index: 0, routes: [{ name: 'songs/[songId]' }] }) }),
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
jest.mock('@/state/session-store', () => ({ useSession: (selector: (state: object) => unknown) => selector({ activeAccountId: mockAccountId }) }));
jest.mock('@/hooks/use-user-library', () => ({ useUserLibrary: () => ({
  data: [], tagPresets: [], isUpdating: false, songKey: (id: string) => `song:${id}`,
  setTagPresets: jest.fn(), setTags: jest.fn(), setSongFavorite: jest.fn(),
}) }));
jest.mock('@/hooks/use-phira', () => ({
  usePhiraPlayer: () => ({ data: { pool: { bestPool: mockBests['38294'] ? [{ chart: mockChart, record: mockBest.record, rks: 12 }] : [], recentPool: [] } }, isLoading: false, isFetching: false, isError: false, error: null, refetch: mockRefetch }),
  usePhiraBests: () => ({ data: { items: mockBests, source: { kind: 'phira', label: 'Phira', updatedAt: 'now', isStale: false } }, isLoading: false, isFetching: false, isError: false, error: null, refetch: mockRefetch }),
  usePhiraDemoBests: (...args: Parameters<typeof import('@/hooks/use-phira').usePhiraDemoBests>) => mockActualDemoQueries
    ? jest.requireActual<typeof import('@/hooks/use-phira')>('@/hooks/use-phira').usePhiraDemoBests(...args)
    : ({ items: [], dataUpdatedAt: 0, isLoading: false, isError: false, error: null, refetch: mockRefetch, hasNextPage: false, isFetchingNextPage: false, isFetchNextPageError: false, fetchNextPage: mockFetchCatalogNextPage }),
  useRefreshAllPhiraBests: () => ({ refreshAll: mockRefreshAll, retryFailed: mockRetryFailedBests }),
  usePhiraCharts: () => ({
    data: { pages: mockCatalogPages ?? [{ results: mockCatalogCharts }] },
    isLoading: false, isError: false, error: null, refetch: mockRefetch,
    hasNextPage: mockCatalogHasNextPage,
    isFetchingNextPage: mockCatalogFetchingNextPage,
    isFetchNextPageError: mockCatalogFetchNextPageError,
    fetchNextPage: mockFetchCatalogNextPage,
  }),
  usePhiraChart: (...args: Parameters<typeof import('@/hooks/use-phira').usePhiraChart>) => mockActualDetailQuery
    ? jest.requireActual<typeof import('@/hooks/use-phira')>('@/hooks/use-phira').usePhiraChart(...args)
    : ({ data: mockChart, isPending: false, isLoading: false, isError: false, error: null }),
  usePhiraChartBest: (...args: Parameters<typeof import('@/hooks/use-phira').usePhiraChartBest>) => mockActualDemoQueries
    ? jest.requireActual<typeof import('@/hooks/use-phira')>('@/hooks/use-phira').usePhiraChartBest(...args)
    : ({ data: mockBest, isLoading: false, isError: false, error: null }),
  usePhiraNotes: (_chart: unknown, enabled = true) => { mockNotesEnabled.push(enabled); return { data: { counts: { click: 40, hold: 20, flick: 20, drag: 20 } }, isLoading: false, isError: false }; },
  usePhiraUploader: () => ({ data: undefined, isLoading: false, isError: true }),
}));
jest.mock('@/components/AppNotification', () => ({
  useNotification: () => ({
    dismissNotification: mockDismissNotification,
    showNotification: mockShowNotification,
    showActionNotification: mockShowActionNotification,
    updateNotification: mockUpdateNotification,
  }),
}));
jest.mock('@/hooks/use-game-data', () => ({
  useGameData: () => ({
    data: {
      payload: {
        kind: 'phira',
        snapshot: {
          pool: {
            bestPool: mockBests['38294']
              ? [{ chart: mockChart, record: mockBest.record, rks: 12 }]
              : [],
            recentPool: [],
          },
          source: { updatedAt: 'now' },
        },
      },
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: mockRefetch,
  }),
}));
jest.mock('@/features/phira-chart-download/chart-package-download', () => ({
  downloadPhiraChartPackage: (chart: unknown, options: unknown) =>
    mockDownloadPhiraPackage(chart, options),
}));
jest.mock('@/features/chart-download-shared/use-chart-package-download', () => ({
  useChartPackageDownload: () => ({ isRunning: false, start: mockStartChartDownload }),
}));
jest.mock('@/components/TagEditor', () => ({ TagEditor: () => { const RN = jest.requireActual<typeof import('react-native')>('react-native'); return <RN.Text>本地标签</RN.Text>; } }));
jest.mock('@/components/game-content/SongDetailChrome', () => ({ SongDetailChrome: (props: typeof mockChromeProps) => { mockChromeProps = props; return null; } }));
jest.mock('@/components/phira/PhiraScoreVisuals', () => ({
  ...jest.requireActual<typeof import('@/components/phira/PhiraScoreVisuals')>('@/components/phira/PhiraScoreVisuals'),
  PhiraScoreValue: ({ score }: { score: number }) => { const RN = jest.requireActual<typeof import('react-native')>('react-native'); return <RN.Text>{score}</RN.Text>; },
  PhiraRateBadge: () => { const RN = jest.requireActual<typeof import('react-native')>('react-native'); return <RN.Text>FC</RN.Text>; },
  resolvePhiraRate: () => 'v',
  PhiraXingBadge: ({ kind }: { kind: string }) => { const RN = jest.requireActual<typeof import('react-native')>('react-native'); return <RN.Text>{`XING-${kind.toUpperCase()}`}</RN.Text>; },
}));

describe('Phira page contracts', () => {
  beforeEach(() => {
    mockBests = {};
    mockCatalogCharts = [];
    mockCatalogPages = null;
    mockCatalogHasNextPage = false;
    mockCatalogFetchingNextPage = false;
    mockCatalogFetchNextPageError = false;
    mockNotesEnabled = [];
    mockStackReady = true;
    mockActualDetailQuery = false;
    mockActualDemoQueries = false;
    mockAccountId = 'phira:community:323528';
    mockChromeProps = null;
    jest.clearAllMocks();
  });

  it('示例最佳与成绩共用上架分页，追加去重且保留失败前的满成绩', async () => {
    mockActualDemoQueries = true;
    mockAccountId = 'phira:test';
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const charts = Array.from({ length: 30 }, (_, index) => ({ ...mockChart, id: 100 + index, name: `示例谱面${index}`, ranked: true, stable: true }));
    const extra = { ...mockChart, id: 200, name: '后页谱面', ranked: true, stable: true };
    const getCharts = jest.spyOn(phiraProvider, 'getCharts')
      .mockResolvedValueOnce({ results: charts, total: 31 })
      .mockRejectedValueOnce(new Error('后页暂不可用'))
      .mockResolvedValueOnce({ results: [charts[29], extra], total: 31 });
    const getBest = jest.spyOn(phiraProvider, 'getChartBest');
    const wrap = (content: React.ReactNode) => <QueryClientProvider client={client}>{content}</QueryClientProvider>;
    const best = await render(wrap(<PhiraBestScreen />));
    expect(await best.findByText('最佳成绩')).toBeTruthy();
    expect(best.getByText('30 条')).toBeTruthy();
    await fireEvent(best.getByTestId('phira-best-results-list'), 'endReached');
    expect(await best.findByText('后页加载失败，点此重试')).toBeTruthy();
    expect(best.getByText('30 条')).toBeTruthy();
    await fireEvent.press(best.getByLabelText('重试加载后页'));
    expect(await best.findByText('31 条')).toBeTruthy();
    await best.unmount();
    const records = await render(wrap(<PhiraRecordsScreen />));
    expect(records.getByTestId('phira-records-list')).toBeTruthy();
    const loaded = await renderHook(() => usePhiraDemoBests('phira:test'), {
      wrapper: ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    });
    expect(loaded.result.current.items.map((item) => item.chart.id)).toEqual([...charts.map((chart) => chart.id), extra.id]);
    expect(loaded.result.current.items.every((item) => item.record!.score === 1_000_000 && item.record!.accuracy === 1 && item.record!.fullCombo)).toBe(true);
    expect(getCharts.mock.calls.map(([input]) => input.page)).toEqual([0, 2, 2]);
    expect(getBest).not.toHaveBeenCalled();
    await loaded.unmount();
    await records.unmount();
    const detail = await render(wrap(<PhiraSongDetailScreen chartId="38294" />));
    expect(detail.getByText('1000000')).toBeTruthy();
    expect(detail.getByText('100.00%')).toBeTruthy();
    expect(detail.getAllByText('100')).toHaveLength(2);
    expect(getBest).not.toHaveBeenCalled();
    await detail.unmount();
    client.clear();
    getCharts.mockRestore();
    getBest.mockRestore();
  });

  it('示例账号切换或取消后不追加迟到页', async () => {
    mockActualDemoQueries = true;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let finish!: (page: PhiraChartPage) => void;
    const getCharts = jest.spyOn(phiraProvider, 'getCharts')
      .mockReturnValueOnce(new Promise(resolve => { finish = resolve; }))
      .mockResolvedValueOnce({ results: [{ ...mockChart, id: 2, name: '当前账号谱面' }], total: 1 });
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const hook = await renderHook<ReturnType<typeof usePhiraDemoBests>, { accountId: string }>(({ accountId }) => usePhiraDemoBests(accountId), { wrapper, initialProps: { accountId: 'phira:test-old' } });
    await hook.rerender({ accountId: 'phira:test' });
    await waitFor(() => expect(hook.result.current.items[0]?.chart.name).toBe('当前账号谱面'));
    await act(async () => finish({ results: [mockChart], total: 1 }));
    expect(hook.result.current.items.map((item) => item.chart.id)).toEqual([2]);
    await hook.unmount();
    client.clear();
    getCharts.mockRestore();
  });

  it('等待详情活动和首个请求期间保留等待界面，刷新沿用已有谱面', async () => {
    mockActualDetailQuery = true;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let finish!: (chart: PhiraChart) => void;
    const request = new Promise<PhiraChart>(resolve => { finish = resolve; });
    const getChart = jest.spyOn(phiraProvider, 'getChart').mockReturnValue(request);
    const tree = (active: boolean) => <QueryClientProvider client={client}>
      <CachedContentActivityScope active={active}><PhiraSongDetailScreen chartId="38294" /></CachedContentActivityScope>
    </QueryClientProvider>;
    const screen = await render(tree(false));
    expect(screen.queryByText('找不到这首谱面')).toBeNull();
    expect(screen.queryByTestId('phira-song-detail-scroll')).toBeNull();
    await screen.rerender(tree(true));
    expect(screen.queryByText('找不到这首谱面')).toBeNull();
    await act(async () => finish(mockChart));
    expect(await screen.findByText(mockChart.name)).toBeTruthy();
    let finishRefresh!: (chart: PhiraChart) => void;
    getChart.mockReturnValue(new Promise(resolve => { finishRefresh = resolve; }));
    await act(async () => { void client.invalidateQueries({ queryKey: ['phira', 'chart', 38294] }); });
    expect(screen.getByText(mockChart.name)).toBeTruthy();
    expect(screen.queryByText('找不到这首谱面')).toBeNull();
    await act(async () => finishRefresh({ ...mockChart, name: '更新后的谱面' }));
    expect(await screen.findByText('更新后的谱面')).toBeTruthy();
    await screen.unmount();
    client.clear();
    getChart.mockRestore();
  });

  it('无效详情目标直接显示空态', async () => {
    mockActualDetailQuery = true;
    const client = new QueryClient();
    const screen = await render(<QueryClientProvider client={client}>
      <CachedContentActivityScope active={false}><PhiraSongDetailScreen chartId="invalid" /></CachedContentActivityScope>
    </QueryClientProvider>);
    expect(screen.getByText('找不到这首谱面')).toBeTruthy();
    await screen.unmount();
    client.clear();
  });

  it('shows Best20 and uses the upstream full difficulty name', async () => {
    mockBests = { '38294': mockBest };
    const screen = await render(<PhiraBestScreen />);
    expect(screen.getByText('Best20')).toBeTruthy();
    expect(screen.getByText('AT Lv.16')).toBeTruthy();
    expect(screen.getByText('XING-GOOD')).toBeTruthy();
    await screen.unmount();
  });

  it('applies the shared tab-bar inset contract to the best, records and catalog lists', async () => {
    mockBests = { '38294': mockBest };
    mockCatalogCharts = [mockChart];
    const best = await render(<PhiraBestScreen />);
    expect(best.getByTestId('phira-best-results-list').props.contentInsetAdjustmentBehavior).toBe('automatic');
    await best.unmount();
    const records = await render(<PhiraRecordsScreen />);
    expect((await records.findByTestId('phira-records-list')).props.contentInsetAdjustmentBehavior).toBe('automatic');
    await records.unmount();
    const catalog = await render(<PhiraCatalogScreen />);
    expect(catalog.getByTestId('phira-catalog-results-list').props.contentInsetAdjustmentBehavior).toBe('automatic');
    await catalog.unmount();
  });

  it('puts records sorting and catalog category/sorting into expanded filter dropdowns', async () => {
    mockBests = { '38294': mockBest };
    const records = await render(<PhiraRecordsScreen />);
    expect(records.getByLabelText('展开筛选，当前 全部')).toBeTruthy();
    await fireEvent.press(records.getByLabelText(/展开筛选/));
    expect(records.getByLabelText('Phira 定数范围下限 16.2')).toBeTruthy();
    expect(records.getByLabelText('Phira 定数范围上限 16.2')).toBeTruthy();
    await fireEvent.press(records.getByLabelText('选择成绩排序，当前 Score'));
    await fireEvent.press(records.getByLabelText('选择成绩排序 ACC'));
    expect(records.getByLabelText('选择成绩排序，当前 ACC')).toBeTruthy();
    await fireEvent.press(records.getByLabelText('收起筛选'));
    expect(records.getByLabelText('展开筛选，当前 排序 ACC')).toBeTruthy();
    await records.unmount();

    const catalog = await render(<PhiraCatalogScreen />);
    expect(catalog.getByLabelText('展开筛选，当前 全部')).toBeTruthy();
    await fireEvent.press(catalog.getByLabelText(/展开筛选/));
    await fireEvent.press(catalog.getByLabelText('选择谱面类别，当前 上架'));
    expect(catalog.getByLabelText('选择谱面类别 上架')).toBeTruthy();
    expect(catalog.getByLabelText('选择谱面类别 特殊')).toBeTruthy();
    expect(catalog.getByLabelText('选择谱面类别 未上架')).toBeTruthy();
    expect(catalog.queryByText('热门')).toBeNull();
    expect(catalog.queryByLabelText('选择谱面类别 全部')).toBeNull();
    await fireEvent.press(catalog.getByLabelText('选择谱面类别 特殊'));
    expect(catalog.getByLabelText('选择谱面类别，当前 特殊')).toBeTruthy();
    await fireEvent.press(catalog.getByLabelText('选择曲库排序，当前 最近更新'));
    await fireEvent.press(catalog.getByLabelText('选择曲库排序 定数降序'));
    expect(catalog.getByLabelText('选择曲库排序，当前 定数降序')).toBeTruthy();
    await fireEvent.press(catalog.getByLabelText('收起筛选'));
    expect(catalog.getByLabelText('展开筛选，当前 类别 特殊 · 排序 定数降序')).toBeTruthy();
    await catalog.unmount();
  });

  it('renders detail visibility, note/judgement tables and five-point rating without removed sections', async () => {
    const screen = await render(<PhiraSongDetailScreen chartId="38294" />);
    expect(screen.queryByText('曲绘画师')).toBeNull();
    expect(screen.getByTestId('phira-metadata-value-作者').props.children).toBe('#1252389');
    expect(screen.getAllByText('未上架')).toHaveLength(2);
    expect(screen.getByText('Click')).toBeTruthy();
    expect(screen.getAllByText('总计')).toHaveLength(1);
    expect(screen.getByText('Perfect')).toBeTruthy();
    expect(screen.getByText('XING-GOOD')).toBeTruthy();
    expect(screen.getByTestId('phira-song-title-scroll')).toBeTruthy();
    expect(StyleSheet.flatten(mockChromeProps?.backStyle(false))).toMatchObject({ left: 8, top: 0 });
    expect(StyleSheet.flatten(mockChromeProps?.favoriteStyle?.(false))).toMatchObject({ right: 8, top: 0 });
    expect(screen.getByText('评分：4.50 / 5（10 票）')).toBeTruthy();
    expect(screen.getByText('本地标签')).toBeTruthy();
    expect(screen.queryByText(/练习清单/)).toBeNull();
    expect(screen.queryByText(/难度标签/)).toBeNull();
    const previewButton = screen.getByLabelText('查看谱面确认：初音未来的消失');
    const downloadButton = screen.getByLabelText('下载谱面文件：初音未来的消失');
    expect(previewButton.props.testID).toBe('gesture-handler-pressable');
    expect(downloadButton.props.testID).toBe('gesture-handler-pressable');
    const detailActions = screen.getAllByRole('button').map((button) => button.props.accessibilityLabel);
    expect(detailActions.indexOf('下载谱面文件：初音未来的消失'))
      .toBe(detailActions.indexOf('查看谱面确认：初音未来的消失') + 1);
    await fireEvent.press(previewButton);
    expect(jest.mocked(mockRouter.push)).toHaveBeenCalledWith(expect.objectContaining({
      pathname: '/songs/phigros-chart-preview',
      params: { requestId: expect.stringMatching(/^cp-/) },
    }));
    const href = jest.mocked(mockRouter.push).mock.calls.at(-1)?.[0] as unknown as { params: { requestId: string } };
    expect(resolveChartPreviewNavigation(href.params.requestId)).toEqual({ game: 'phira', chart: mockChart });
    await fireEvent.press(downloadButton);
    expect(mockDownloadPhiraPackage).toHaveBeenCalledWith(
      mockChart,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    await screen.unmount();
  });

  it('uses a native RN pressable for the detail preview button on Android', async () => {
    const originalOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    try {
      const screen = await render(<PhiraSongDetailScreen chartId="38294" />);
      expect(screen.getByLabelText('查看谱面确认：初音未来的消失').props.testID).toBeUndefined();
      expect(screen.getByLabelText('下载谱面文件：初音未来的消失').props.testID).toBeUndefined();
      await screen.unmount();
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS });
    }
  });

  it('keeps the random-song filter expanded without hint or collapse controls', async () => {
    mockBests = { '38294': mockBest };
    const screen = await render(<PhiraRandomChartsScreen />);
    expect(screen.getByTestId('random-charts-filter')).toBeTruthy();
    expect(screen.getByText('定数')).toBeTruthy();
    expect(screen.queryByText(/沿用/)).toBeNull();
    expect(screen.queryByLabelText(/展开筛选/)).toBeNull();
    expect(screen.queryByLabelText('收起筛选')).toBeNull();
    await screen.unmount();
  });

  it('explains that the example account does not support random draws', async () => {
    mockAccountId = 'phira:test';
    const screen = await render(<PhiraRandomChartsScreen />);
    expect(screen.getByText('当前示例账号暂不支持随机抽取')).toBeTruthy();
    expect(screen.getByTestId('random-charts-draw').props.accessibilityState.disabled).toBe(true);
  });

  it('keeps deferred detail work disabled until stack readiness', async () => {
    mockStackReady = false;
    const screen = await render(<PhiraSongDetailScreen chartId="38294" />);
    expect(mockNotesEnabled).not.toContain(true);
    await screen.unmount();
    expect(mockNotesEnabled).not.toContain(true);
  });
});

describe('Phira catalog pagination states', () => {
  beforeEach(() => {
    mockBests = {};
    mockCatalogCharts = [];
    mockCatalogPages = null;
    mockCatalogHasNextPage = false;
    mockCatalogFetchingNextPage = false;
    mockCatalogFetchNextPageError = false;
    jest.clearAllMocks();
  });

  const catalogPage = (page: number) => ({
    results: Array.from({ length: 30 }, (_, index) => ({ ...mockChart, id: page * 30 + index + 1 })),
  });
  const filterOutEveryChart = async (screen: Awaited<ReturnType<typeof render>>) => {
    await fireEvent.press(screen.getByLabelText(/展开筛选/));
    const track = screen.getByTestId('phira-filter-constant-track');
    await fireEvent(track, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 100, height: 36 } } });
    await fireEvent.press(track, { nativeEvent: { locationX: 80 } });
  };

  it('扫描预算耗尽仍然后页时保留继续扫描入口，而不是永久加载态', async () => {
    mockCatalogPages = Array.from({ length: 8 }, (_, page) => catalogPage(page));
    mockCatalogHasNextPage = true;
    const screen = await render(<PhiraCatalogScreen />);
    await filterOutEveryChart(screen);
    expect(screen.queryByText('没有找到 Phira 谱面')).toBeNull();
    expect(screen.getByLabelText('继续扫描')).toBeTruthy();
    expect(mockFetchCatalogNextPage).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('继续扫描'));
    expect(mockFetchCatalogNextPage).toHaveBeenCalledTimes(1);
    await screen.unmount();
  });

  it('预算内的空结果继续自动扫描，达到预算后不再自动请求', async () => {
    mockCatalogPages = Array.from({ length: 3 }, (_, page) => catalogPage(page));
    mockCatalogHasNextPage = true;
    const screen = await render(<PhiraCatalogScreen />);
    await filterOutEveryChart(screen);
    expect(mockFetchCatalogNextPage).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('继续扫描')).toBeNull();
    await screen.unmount();
  });

  it('预算耗尽后的空态按实际页数说明上限', async () => {
    mockCatalogPages = Array.from({ length: PHIRA_CATALOG_PAGE_SCAN_BUDGET + 1 }, (_, page) => catalogPage(page));
    mockCatalogHasNextPage = true;
    const screen = await render(<PhiraCatalogScreen />);
    await filterOutEveryChart(screen);
    expect(screen.getByText(`已扫描 ${PHIRA_CATALOG_PAGE_SCAN_BUDGET + 1} 页仍无匹配谱面`)).toBeTruthy();
    expect(screen.getByLabelText('继续扫描')).toBeTruthy();
    await screen.unmount();
  });

  it('后页失败时保留已加载结果并给出重试入口', async () => {
    mockCatalogCharts = [mockChart, { ...mockChart, id: 38295 }];
    mockCatalogHasNextPage = true;
    mockCatalogFetchNextPageError = true;
    const screen = await render(<PhiraCatalogScreen />);
    expect(screen.getAllByLabelText(/^查看歌曲/)).toHaveLength(2);
    expect(screen.getByText('后页加载失败，点此重试')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('重试加载后页'));
    expect(mockFetchCatalogNextPage).toHaveBeenCalledTimes(1);
    await screen.unmount();
  });

  it('后页确实耗尽且无结果时才显示未找到', async () => {
    const screen = await render(<PhiraCatalogScreen />);
    expect(screen.getByText('没有找到 Phira 谱面')).toBeTruthy();
    expect(screen.queryByLabelText('继续扫描')).toBeNull();
    expect(screen.queryByText('后页加载失败，点此重试')).toBeNull();
    await screen.unmount();
  });
});
