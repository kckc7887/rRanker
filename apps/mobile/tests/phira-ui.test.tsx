import { fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { InteractionManager, Platform, StyleSheet } from 'react-native';
import { router as mockRouter } from 'expo-router';
import { PhiraRandomChartsScreen } from '@/screens/PhiraRandomChartsScreen';
import { PhiraBestScreen, PhiraCatalogScreen, PhiraRecordsScreen, PhiraSongDetailScreen } from '@/screens/PhiraScreens';
import { resolveChartPreviewNavigation } from '@/features/phigros-chart-preview/chart-preview-navigation';

const mockRefetch = jest.fn(async () => ({ data: undefined }));
const mockRefreshAll = jest.fn(async () => null);
const mockChart = {
  id: 38294, name: '初音未来的消失', level: 'AT Lv.16', difficulty: 16.2,
  charter: '谱师', composer: 'CosMo@暴走P', illustrator: '', description: '简介',
  ranked: false, stable: false, uploader: 1252389, tags: ['regular'], rating: .9, ratingCount: 10,
  created: '2025-05-18T06:02:48.727Z', updated: '2025-05-20T22:46:26.729Z', chartUpdated: null,
  illustration: null, preview: null, file: null,
};
const mockBest = {
  chart: mockChart, poolRks: null, queriedAt: '2026-08-13T00:00:00.000Z',
  record: { id: 1, chart: mockChart.id, score: 999_000, accuracy: .999, perfect: 99, good: 1, bad: 0, miss: 0, fullCombo: true, best: true, created: null },
};
let mockBests: Record<string, typeof mockBest> = {};
let mockCatalogCharts: typeof mockChart[] = [];
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
  useRefreshAllPhiraBests: () => mockRefreshAll,
  usePhiraCharts: () => ({ data: { pages: [{ results: mockCatalogCharts }] }, isLoading: false, isError: false, error: null, refetch: mockRefetch, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() }),
  usePhiraChart: () => ({ data: mockChart, isLoading: false, isError: false, error: null }),
  usePhiraChartBest: () => ({ data: mockBest, isLoading: false, isError: false, error: null }),
  usePhiraNotes: (_chart: unknown, enabled = true) => { mockNotesEnabled.push(enabled); return { data: { counts: { click: 40, hold: 20, flick: 20, drag: 20 } }, isLoading: false, isError: false }; },
  usePhiraUploader: () => ({ data: undefined, isLoading: false, isError: true }),
}));
jest.mock('@/components/SourceStatus', () => ({ SourceStatus: () => { const RN = jest.requireActual<typeof import('react-native')>('react-native'); return <RN.Text>数据状态</RN.Text>; } }));
jest.mock('@/components/AppNotification', () => ({
  useNotification: () => ({ showNotification: jest.fn(), showActionNotification: jest.fn() }),
}));
jest.mock('@/components/TagEditor', () => ({ TagEditor: () => { const RN = jest.requireActual<typeof import('react-native')>('react-native'); return <RN.Text>本地标签</RN.Text>; } }));
jest.mock('@/components/game-content/SongDetailChrome', () => ({ SongDetailChrome: (props: typeof mockChromeProps) => { mockChromeProps = props; return null; } }));
jest.mock('@/components/phigros/PhigrosScoreValue', () => ({ PhigrosScoreValue: ({ score }: { score: number }) => { const RN = jest.requireActual<typeof import('react-native')>('react-native'); return <RN.Text>{score}</RN.Text>; } }));
jest.mock('@/components/phigros/PhigrosRateBadge', () => ({ PhigrosRateBadge: () => { const RN = jest.requireActual<typeof import('react-native')>('react-native'); return <RN.Text>FC</RN.Text>; }, resolvePhigrosRate: () => 'v' }));
jest.mock('@/components/phigros/PhigrosXingBadge', () => ({ PhigrosXingBadge: ({ kind }: { kind: string }) => { const RN = jest.requireActual<typeof import('react-native')>('react-native'); return <RN.Text>{`XING-${kind.toUpperCase()}`}</RN.Text>; } }));

describe('Phira page contracts', () => {
  beforeEach(() => { mockBests = {}; mockCatalogCharts = []; mockNotesEnabled = []; mockChromeProps = null; jest.clearAllMocks(); });

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
    const records = await render(<PhiraRecordsScreen />);
    expect(records.getByText('查询过歌曲后，最佳成绩会显示在这里')).toBeTruthy();
    expect(records.getByLabelText('展开筛选，当前 全部')).toBeTruthy();
    await fireEvent.press(records.getByLabelText(/展开筛选/));
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
    expect(previewButton.props.testID).toBe('gesture-handler-pressable');
    await fireEvent.press(previewButton);
    expect(jest.mocked(mockRouter.push)).toHaveBeenCalledWith(expect.objectContaining({
      pathname: '/songs/phigros-chart-preview',
      params: { requestId: expect.stringMatching(/^cp-/) },
    }));
    const href = jest.mocked(mockRouter.push).mock.calls.at(-1)?.[0] as unknown as { params: { requestId: string } };
    expect(resolveChartPreviewNavigation(href.params.requestId)).toEqual({ game: 'phira', chart: mockChart });
    await screen.unmount();
  });

  it('uses a native RN pressable for the detail preview button on Android', async () => {
    const originalOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    try {
      const screen = await render(<PhiraSongDetailScreen chartId="38294" />);
      expect(screen.getByLabelText('查看谱面确认：初音未来的消失').props.testID).toBeUndefined();
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
