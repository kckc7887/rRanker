import { fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { InteractionManager, Platform, StyleSheet } from 'react-native';
import { router as mockRouter } from 'expo-router';
import { PhiraRandomChartsScreen } from '@/screens/PhiraRandomChartsScreen';
import { PhiraBestScreen, PhiraCatalogScreen, PhiraRecordsScreen, PhiraSongDetailScreen } from '@/screens/PhiraScreens';
import { PHIRA_CATALOG_PAGE_SCAN_BUDGET } from '@/domain/phira';
import { resolveChartPreviewNavigation } from '@/features/phigros-chart-preview/chart-preview-navigation';

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
const mockFetchCatalogNextPage = jest.fn();
let mockNotesEnabled: boolean[] = [];
let mockChromeProps: {
  topInset: number;
  backStyle: (pressed: boolean) => object[];
  favoriteStyle?: (pressed: boolean) => object[];
} | null = null;

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
jest.mock('@/state/session-store', () => ({ useSession: (selector: (state: object) => unknown) => selector({ activeAccountId: 'phira:community:323528' }) }));
jest.mock('@/hooks/use-user-library', () => ({ useUserLibrary: () => ({
  data: [], tagPresets: [], isUpdating: false, songKey: (id: string) => `song:${id}`,
  setTagPresets: jest.fn(), setTags: jest.fn(), setSongFavorite: jest.fn(),
}) }));
jest.mock('@/hooks/use-phira', () => ({
  usePhiraPlayer: () => ({ data: { pool: { bestPool: mockBests['38294'] ? [{ chart: mockChart, record: mockBest.record, rks: 12 }] : [], recentPool: [] } }, isLoading: false, isFetching: false, isError: false, error: null, refetch: mockRefetch }),
  usePhiraBests: () => ({ data: { items: mockBests, source: { kind: 'phira', label: 'Phira', updatedAt: 'now', isStale: false } }, isLoading: false, isFetching: false, isError: false, error: null, refetch: mockRefetch }),
  useRefreshAllPhiraBests: () => ({ refreshAll: mockRefreshAll, retryFailed: mockRetryFailedBests }),
  usePhiraCharts: () => ({
    data: { pages: mockCatalogPages ?? [{ results: mockCatalogCharts }] },
    isLoading: false, isError: false, error: null, refetch: mockRefetch,
    hasNextPage: mockCatalogHasNextPage,
    isFetchingNextPage: mockCatalogFetchingNextPage,
    isFetchNextPageError: mockCatalogFetchNextPageError,
    fetchNextPage: mockFetchCatalogNextPage,
  }),
  usePhiraChart: () => ({ data: mockChart, isLoading: false, isError: false, error: null }),
  usePhiraChartBest: () => ({ data: mockBest, isLoading: false, isError: false, error: null }),
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
jest.mock('@/features/phira-compatible-chart-download/phira-compatible-chart-download', () => ({
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
    mockChromeProps = null;
    jest.clearAllMocks();
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
    expect(records.getByTestId('phira-records-list').props.contentInsetAdjustmentBehavior).toBe('automatic');
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
    expect(records.getByLabelText('Phigros 定数范围下限 16.2')).toBeTruthy();
    expect(records.getByLabelText('Phigros 定数范围上限 16.2')).toBeTruthy();
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

  it('cancels deferred detail work when leaving during the navigation transition', async () => {
    const cancel = jest.fn();
    const interaction = jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation(() => ({
      cancel,
    }) as unknown as ReturnType<typeof InteractionManager.runAfterInteractions>);
    const screen = await render(<PhiraSongDetailScreen chartId="38294" />);
    expect(mockNotesEnabled).toEqual([false]);
    await screen.unmount();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(mockNotesEnabled).not.toContain(true);
    interaction.mockRestore();
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
  // 通过定数上限把 16.2 的曲目全部筛掉，得到「翻页有数据但筛选结果为空」的真实场景。
  const filterOutEveryChart = async (screen: Awaited<ReturnType<typeof render>>) => {
    await fireEvent.press(screen.getByLabelText(/展开筛选/));
    const track = screen.getByTestId('phigros-filter-constant-track');
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
