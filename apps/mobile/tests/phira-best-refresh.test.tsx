import { act, cleanup, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { NotificationProvider } from '@/components/AppNotification';
import { PhiraRecordsScreen } from '@/screens/PhiraScreens';
import { phiraProvider } from '@/providers/phira-provider';
import { phiraBestCacheKey, PhiraChartSchema, PhiraRecordSchema, PhiraUserSchema, PhiraUserStatsSchema, type PhiraBestSnapshot, type PhiraQueriedBest } from '@/domain/phira';
import { useRefreshAllPhiraBests } from '@/hooks/use-phira';
import { queryClient } from '@/state/query-client';
import { abortForegroundWork, beginForegroundWork } from '@/state/app-lifecycle-core';

jest.mock('@/storage/sqlite-snapshot-repository', () => {
  const state = { values: new Map<string, unknown>(), failReads: false };
  class MemorySnapshotRepository {
    async getResource<T>(key: string) {
      if (state.failReads) throw new Error('storage read failed');
      return (state.values.get(key) as T | undefined) ?? null;
    }
    async saveResource<T>(key: string, _version: number, _updatedAt: string, value: T) {
      state.values.set(key, value);
    }
    async updateResource<T>(key: string, _version: number, transform: (previous: T | null) => { value: T; updatedAt: string }) {
      const { value } = transform((state.values.get(key) as T | undefined) ?? null);
      state.values.set(key, value);
      return value;
    }
    async clearResources(keys: readonly string[]) {
      keys.forEach((key) => state.values.delete(key));
    }
  }
  return { SqliteSnapshotRepository: MemorySnapshotRepository, __memory: state };
});
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { push: jest.fn(), back: jest.fn() },
  useNavigation: () => ({ getState: () => ({ index: 0, routes: [{ name: 'songs/[songId]' }] }) }),
  useFocusEffect: () => undefined,
}));
jest.mock('expo-image', () => ({ Image: (props: object) => { const RN = jest.requireActual<typeof import('react-native')>('react-native'); return <RN.View {...props} />; } }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children, ...props }: { children?: ReactNode }) => { const RN = jest.requireActual<typeof import('react-native')>('react-native'); return <RN.View {...props}>{children}</RN.View>; } }));
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
  onAccent: '#FFF',
}) }));
jest.mock('@/state/session-store', () => ({
  useSession: (selector: (state: object) => unknown) => selector({ activeAccountId: 'phira:community:323528' }),
}));
jest.mock('@/hooks/use-user-library', () => ({ useUserLibrary: () => ({
  data: [], tagPresets: [], isUpdating: false, songKey: (id: string) => `song:${id}`,
  setTagPresets: jest.fn(), setTags: jest.fn(), setSongFavorite: jest.fn(),
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
jest.mock('@/components/phira/PhiraScoreVisuals', () => ({
  ...jest.requireActual<typeof import('@/components/phira/PhiraScoreVisuals')>('@/components/phira/PhiraScoreVisuals'),
  PhiraScoreValue: ({ score }: { score: number }) => { const RN = jest.requireActual<typeof import('react-native')>('react-native'); return <RN.Text>{score}</RN.Text>; },
  PhiraRateBadge: () => null,
  resolvePhiraRate: () => 'v',
  PhiraXingBadge: () => null,
}));

const PLAYER_ID = 323528;
type MemoryState = { values: Map<string, unknown>; failReads: boolean };
const memory = () => (jest.requireMock('@/storage/sqlite-snapshot-repository') as { __memory: MemoryState }).__memory;

const chart = (id: number) => PhiraChartSchema.parse({
  id, name: `Chart ${id}`, level: 'AT Lv.16', difficulty: 15.2, uploader: 9,
});
const record = (id: number, chartId: number, score: number) => PhiraRecordSchema.parse({
  id, chart: chartId, score, accuracy: .99, best: true,
});
const queriedBest = (chartId: number, score: number): PhiraQueriedBest => ({
  chart: chart(chartId), record: record(chartId * 10, chartId, score), poolRks: 12,
  queriedAt: '2026-01-01T00:00:00.000Z',
});
const bestSnapshot = (values: readonly PhiraQueriedBest[], updatedAt: string): PhiraBestSnapshot => ({
  items: Object.fromEntries(values.map((value) => [String(value.chart.id), value])),
  source: { kind: 'phira', label: 'Phira 社区公开数据', updatedAt, isStale: false },
});
const seedBests = (values: readonly PhiraQueriedBest[]) => {
  memory().values.set(phiraBestCacheKey(PLAYER_ID), bestSnapshot(values, '2026-01-01T00:00:00.000Z'));
};
const poolWith = (chartIds: readonly number[]) => ({
  bestPool: chartIds.map((chartId, index) => ({ record: chartId * 10, chart: chartId, rks: 12 + index })),
  recentPool: [], rks: 12,
});
const stubPlayerTransport = (chartIds: readonly number[]) => {
  jest.spyOn(phiraProvider, 'getUser').mockResolvedValue(PhiraUserSchema.parse({ id: PLAYER_ID, name: '玩家' }));
  jest.spyOn(phiraProvider, 'getUserStats').mockResolvedValue(PhiraUserStatsSchema.parse({}));
  jest.spyOn(phiraProvider, 'getPool').mockResolvedValue(poolWith(chartIds));
  jest.spyOn(phiraProvider, 'getRecent').mockResolvedValue([]);
  jest.spyOn(phiraProvider, 'getChartsByIds').mockImplementation(async (ids) => ids.map(chart));
  jest.spyOn(phiraProvider, 'getRecordsByIds').mockImplementation(async (ids) =>
    ids.map((id) => record(id, Math.floor(id / 10), 900_000)));
};

/** 只替换 transport：谱面最佳成绩的返回由各用例决定。 */
const chartBestCalls: number[] = [];
function stubChartBest(load: (chartId: number) => Promise<unknown[]>) {
  jest.spyOn(phiraProvider, 'getChartBest').mockImplementation(async (_playerId, chartId) => {
    chartBestCalls.push(chartId);
    return load(chartId) as never;
  });
}

function renderRecords() {
  return render(
    <QueryClientProvider client={queryClient}>
      <NotificationProvider>
        <PhiraRecordsScreen />
      </NotificationProvider>
    </QueryClientProvider>,
  );
}

describe('Phira 成绩刷新操作结果（真实 Hook 到记录页链路）', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    chartBestCalls.length = 0;
    queryClient.clear();
    queryClient.setDefaultOptions({ queries: { retry: false } });
    memory().values.clear();
    memory().failReads = false;
    beginForegroundWork();
  });
  afterEach(async () => {
    await cleanup();
    queryClient.clear();
    memory().values.clear();
    memory().failReads = false;
    beginForegroundWork();
    jest.restoreAllMocks();
  });

  it('没有需要刷新的谱面时是 noop：不请求、不写入', async () => {
    stubPlayerTransport([]);
    stubChartBest(async () => []);
    const hook = await renderHook(() => useRefreshAllPhiraBests(PLAYER_ID));
    let outcome: Awaited<ReturnType<ReturnType<typeof useRefreshAllPhiraBests>['refreshAll']>> | undefined;
    await act(async () => { outcome = await hook.result.current.refreshAll(); });

    expect(outcome?.status).toBe('noop');
    expect(outcome).toMatchObject({ requestedCount: 0, updatedCount: 0, failedChartIds: [] });
    expect(chartBestCalls).toEqual([]);
    expect(memory().values.has(phiraBestCacheKey(PLAYER_ID))).toBe(false);
  });

  it('首次没有成绩且全部失败时是 failed，并保留失败明细', async () => {
    stubPlayerTransport([202]);
    stubChartBest(async () => { throw new Error('network down'); });
    const hook = await renderHook(() => useRefreshAllPhiraBests(PLAYER_ID));
    let outcome: Awaited<ReturnType<ReturnType<typeof useRefreshAllPhiraBests>['refreshAll']>> | undefined;
    await act(async () => { outcome = await hook.result.current.refreshAll(); });

    expect(outcome).toEqual({ status: 'failed', requestedCount: 1, updatedCount: 0, failedChartIds: [202] });
    expect(memory().values.has(phiraBestCacheKey(PLAYER_ID))).toBe(false);
  });

  it('已有成绩且全部失败时也是 failed，但保留可用数据', async () => {
    seedBests([queriedBest(101, 950_000)]);
    stubPlayerTransport([]);
    stubChartBest(async () => { throw new Error('network down'); });
    const hook = await renderHook(() => useRefreshAllPhiraBests(PLAYER_ID));
    let outcome: Awaited<ReturnType<ReturnType<typeof useRefreshAllPhiraBests>['refreshAll']>> | undefined;
    await act(async () => { outcome = await hook.result.current.refreshAll(); });

    expect(outcome).toEqual({ status: 'failed', requestedCount: 1, updatedCount: 0, failedChartIds: [101] });
    const persisted = memory().values.get(phiraBestCacheKey(PLAYER_ID)) as PhiraBestSnapshot;
    expect(persisted.source.updatedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(persisted.items['101'].record?.score).toBe(950_000);
  });

  it('部分成功时是 partial，并只把失败项留给重试', async () => {
    seedBests([queriedBest(101, 950_000)]);
    stubPlayerTransport([202]);
    let failOnce = true;
    stubChartBest(async (chartId) => {
      if (chartId === 202 && failOnce) { failOnce = false; throw new Error('network down'); }
      return [record(chartId * 10, chartId, 990_000)];
    });
    const hook = await renderHook(() => useRefreshAllPhiraBests(PLAYER_ID));
    let outcome: Awaited<ReturnType<ReturnType<typeof useRefreshAllPhiraBests>['refreshAll']>> | undefined;
    await act(async () => { outcome = await hook.result.current.refreshAll(); });

    expect(outcome).toEqual({ status: 'partial', requestedCount: 2, updatedCount: 1, failedChartIds: [202] });
    expect(chartBestCalls.sort()).toEqual([101, 202]);

    chartBestCalls.length = 0;
    let retried: Awaited<ReturnType<ReturnType<typeof useRefreshAllPhiraBests>['retryFailed']>> | undefined;
    await act(async () => { retried = await hook.result.current.retryFailed(); });
    expect(chartBestCalls).toEqual([202]);
    expect(retried).toEqual({ status: 'success', requestedCount: 1, updatedCount: 1, failedChartIds: [] });
    const persisted = memory().values.get(phiraBestCacheKey(PLAYER_ID)) as PhiraBestSnapshot;
    expect(Object.keys(persisted.items).sort()).toEqual(['101', '202']);
  });

  it('全部成功时是 success', async () => {
    stubPlayerTransport([202]);
    stubChartBest(async (chartId) => [record(chartId * 10, chartId, 990_000)]);
    const hook = await renderHook(() => useRefreshAllPhiraBests(PLAYER_ID));
    let outcome: Awaited<ReturnType<ReturnType<typeof useRefreshAllPhiraBests>['refreshAll']>> | undefined;
    await act(async () => { outcome = await hook.result.current.refreshAll(); });

    expect(outcome).toEqual({ status: 'success', requestedCount: 1, updatedCount: 1, failedChartIds: [] });
  });

  it('取消时是 cancelled，与失败区分', async () => {
    seedBests([queriedBest(101, 950_000)]);
    stubPlayerTransport([]);
    stubChartBest(async () => { throw new Error('network down'); });
    const hook = await renderHook(() => useRefreshAllPhiraBests(PLAYER_ID));
    let outcome: Awaited<ReturnType<ReturnType<typeof useRefreshAllPhiraBests>['refreshAll']>> | undefined;
    await act(async () => {
      const refreshing = hook.result.current.refreshAll().then((value) => { outcome = value; });
      abortForegroundWork();
      await refreshing;
    });

    expect(outcome).toEqual({ status: 'cancelled', requestedCount: 0, updatedCount: 0, failedChartIds: [] });
  });
});

describe('Phira 记录页刷新结果可见', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    chartBestCalls.length = 0;
    queryClient.clear();
    queryClient.setDefaultOptions({ queries: { retry: false } });
    memory().values.clear();
    memory().failReads = false;
    beginForegroundWork();
  });
  afterEach(async () => {
    await cleanup();
    queryClient.clear();
    memory().values.clear();
    memory().failReads = false;
    beginForegroundWork();
    jest.restoreAllMocks();
  });

  const pullToRefresh = async (screen: Awaited<ReturnType<typeof renderRecords>>) => {
    await act(async () => {
      await screen.getByTestId('phira-records-list').props.onRefresh();
    });
  };

  it('已有成绩且全部失败时保留列表并显示失败与重试入口', async () => {
    seedBests([queriedBest(101, 950_000)]);
    stubPlayerTransport([]);
    stubChartBest(async () => { throw new Error('network down'); });
    const screen = await renderRecords();
    await waitFor(() => expect(screen.getByText('Chart 101')).toBeTruthy());

    await pullToRefresh(screen);

    await waitFor(() => expect(screen.getByText('谱面成绩未更新')).toBeTruthy());
    expect(screen.getByText('1 首谱面刷新失败，可点此重试。')).toBeTruthy();
    // 可用数据保留在列表里。
    expect(screen.getByText('Chart 101')).toBeTruthy();
    expect(screen.getByText('950000')).toBeTruthy();

    chartBestCalls.length = 0;
    await fireEvent.press(screen.getByText('重试失败项'));
    await waitFor(() => expect(chartBestCalls).toEqual([101]));
  });

  it('部分成功时显示失败数量，重试只请求失败的谱面并保留成功项', async () => {
    seedBests([queriedBest(101, 950_000)]);
    stubPlayerTransport([202]);
    let failOnce = true;
    stubChartBest(async (chartId) => {
      if (chartId === 202 && failOnce) { failOnce = false; throw new Error('network down'); }
      return [record(chartId * 10, chartId, 990_000)];
    });
    const screen = await renderRecords();
    await waitFor(() => expect(screen.getByText('Chart 101')).toBeTruthy());

    await pullToRefresh(screen);

    await waitFor(() => expect(screen.getByText('部分谱面成绩未更新')).toBeTruthy());
    expect(screen.getByText('1 首谱面刷新失败，可点此重试。')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('990000')).toBeTruthy());

    chartBestCalls.length = 0;
    await fireEvent.press(screen.getByText('重试失败项'));
    await waitFor(() => expect(chartBestCalls).toEqual([202]));
    await waitFor(() => expect(screen.getByText('Chart 202')).toBeTruthy());
    // 重试成功后失败提示自行关闭。
    await waitFor(() => expect(screen.queryByText('部分谱面成绩未更新')).toBeNull(), { timeout: 3000 });
  });

  it('全部成功时不显示失败提示并更新列表', async () => {
    seedBests([queriedBest(101, 950_000)]);
    stubPlayerTransport([202]);
    stubChartBest(async (chartId) => [record(chartId * 10, chartId, 990_000)]);
    const screen = await renderRecords();
    await waitFor(() => expect(screen.getByText('Chart 101')).toBeTruthy());

    await pullToRefresh(screen);

    await waitFor(() => expect(chartBestCalls.sort()).toEqual([101, 202]));
    expect(screen.queryByText('谱面成绩未更新')).toBeNull();
    expect(screen.queryByText('部分谱面成绩未更新')).toBeNull();
    await waitFor(() => expect(screen.getByText('Chart 202')).toBeTruthy());
    expect(screen.getAllByText('990000')).toHaveLength(2);
  });

  it('首次没有成绩且全部失败时页面提示失败且不写入缓存，重试后恢复', async () => {
    memory().failReads = true;
    stubPlayerTransport([202]);
    stubChartBest(async (chartId) => {
      if (chartBestCalls.filter((id) => id === chartId).length === 1) throw new Error('network down');
      return [record(chartId * 10, chartId, 990_000)];
    });
    const screen = await renderRecords();
    await waitFor(() => expect(screen.getByText('加载失败，请重试')).toBeTruthy());

    memory().failReads = false;
    await fireEvent.press(screen.getByText('重试'));

    await waitFor(() => expect(screen.getByText('谱面成绩未更新')).toBeTruthy());
    expect(screen.getByText('1 首谱面刷新失败，可点此重试。')).toBeTruthy();
    expect(memory().values.has(phiraBestCacheKey(PLAYER_ID))).toBe(false);

    await fireEvent.press(screen.getByText('重试失败项'));
    await waitFor(() => expect(screen.getByText('Chart 202')).toBeTruthy());
  });
});
