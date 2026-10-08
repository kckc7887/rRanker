import { act, fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { MuseDashRandomChartsScreen } from '@/screens/MuseDashRandomChartsScreen';
import type {
  MuseDashAlbumsResponse,
  MuseDashAchievementFilter,
  MuseDashCeResponse,
  MuseDashDifficultySlot,
  MuseDashMissDetailValue,
  MuseDashPlayer,
} from '@/domain/muse-dash';
import type { RandomChartsCount } from '@/domain/random-charts';

const mockRefetch = jest.fn(async () => ({ data: undefined }));
const mockRetryFailedDetails = jest.fn();
let mockMissMap: ReadonlyMap<string, MuseDashMissDetailValue> = new Map();
let mockFailedDetailCount = 0;
let mockQueryStates: Partial<Record<'player' | 'albums' | 'ce' | 'diffdiff', Record<string, unknown>>> = {};
let mockFilters = {
  count: 1 as RandomChartsCount, collapsed: true, difficultySlot: 'all' as MuseDashDifficultySlot, dlc: 'all' as const,
  constantMin: '', constantMax: '', accMin: '', accMax: '',
  achievement: 'ap' as MuseDashAchievementFilter,
};
const mockFilterActions = {
  hydrate: jest.fn(async () => undefined),
  setCount: jest.fn(), setCollapsed: jest.fn(), setDifficultySlot: jest.fn(), setDlc: jest.fn(),
  setConstantMin: jest.fn(), setConstantMax: jest.fn(), setAccMin: jest.fn(), setAccMax: jest.fn(),
  setAchievement: jest.fn(), clearFilters: jest.fn(),
};

const diffdiff = [
  ['0-47', 4, '12', 739.7, 12.5],
  ['0-48', 0, '1', 100, 1.5],
] as [string, number, string, number, number][];

const albums: MuseDashAlbumsResponse = {
  ALBUM1: {
    title: 'Default Music', json: 'ALBUM1', tag: 'Default',
    music: {
      '0-47': {
        uid: '0-47', name: 'Sample Song', author: 'Sample Author', cover: 'sample_cover',
        bpm: '128', levelDesigner: ['Mapper A'], difficulty: ['2', '5', '8', '11', '12'],
        ChineseS: { name: '示例歌曲', author: '示例作者' },
      },
      '0-48': {
        uid: '0-48', name: 'Unplayed Song', author: 'Silent Author', cover: 'unplayed_cover',
        bpm: '90', levelDesigner: ['Mapper B'], difficulty: ['1', '0', '0', '0', '0'],
        ChineseS: { name: '未游玩歌曲', author: '沉默作者' },
      },
    },
  },
};

const ce: MuseDashCeResponse = { c: { ChineseS: ['凛'], English: [] }, e: { ChineseS: ['喵斯'], English: [] } };

const player: MuseDashPlayer = {
  lastUpdate: 1786311369798, rl: 3.45, diffHistoryNumber: 2,
  plays: [
    { score: 1_000_000, acc: 100, platform: 'mobile', difficulty: 4, uid: '0-47', sum: 10000 },
    { score: 999_999, acc: 100, platform: 'mobile', difficulty: 0, uid: '0-48', sum: 9999 },
  ],
  user: { user_id: 'user-1', nickname: 'Tester' },
};

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { push: jest.fn(), back: jest.fn() },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/theme/app-theme', () => ({ useAppTheme: () => ({
  background: '#F7F8FA', surface: '#FFF', surfaceMuted: '#EEF2F7', input: '#F1F3F5', border: '#DDD',
  text: '#111', textSecondary: '#4B5563', textMuted: '#666', accent: '#246BFD', accentSoft: '#E8F0FF',
  danger: '#B42318', dark: false,
}) }));
jest.mock('@/state/session-store', () => ({
  useSession: (selector: (state: unknown) => unknown) => selector({
    activeAccountId: 'musedash:musedash-moe:user-1',
    activeGameId: 'musedash',
  }),
}));
jest.mock('@/state/musedash-random-charts-filter', () => ({
  useMuseDashRandomChartsFilter: () => ({ ...mockFilters, ...mockFilterActions }),
}));
jest.mock('@/hooks/use-muse-dash', () => {
  const query = (data: unknown, name?: keyof typeof mockQueryStates) => ({
    data,
    source: { kind: 'musedash', label: 'MuseDash.moe', updatedAt: '2026-08-10T00:00:00.000Z', isStale: false },
    isLoading: false, isError: false, error: null, isFetching: false, refetch: mockRefetch,
    ...(name ? mockQueryStates[name] : {}),
  });
  return {
    useMuseDashPlayer: () => query(player, 'player'),
    useMuseDashAlbums: () => query(albums, 'albums'),
    useMuseDashCe: () => query(ce, 'ce'),
    useMuseDashDiffdiff: () => query(diffdiff, 'diffdiff'),
    useMuseDashPlayDetail: () => query(undefined),
    useMuseDashPlayDetails: () => ({
      missByChart: mockMissMap,
      failedCount: mockFailedDetailCount,
      retryFailed: mockRetryFailedDetails,
    }),
  };
});

describe('Muse Dash random charts achievement gating', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMissMap = new Map();
    mockFailedDetailCount = 0;
    mockQueryStates = {};
    mockFilters = { ...mockFilters, count: 1, difficultySlot: 'all', accMin: '', accMax: '', achievement: 'ap' };
  });

  it('只把已确认 miss 的候选算进候选池，pending 明细期间不交付抽取结果', async () => {
    mockMissMap = new Map([['0-47:4', 0], ['0-48:0', null]]);
    const screen = await render(<MuseDashRandomChartsScreen />);
    expect(screen.getByText('正在核对成就明细…')).toBeTruthy();
    expect(screen.queryByText('候选谱面 2 条')).toBeNull();
    expect(screen.getByTestId('random-charts-draw').props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByTestId('random-charts-draw'));
    expect(screen.queryByTestId('random-charts-results')).toBeNull();
    await screen.unmount();
  });

  it('明细到齐后恢复抽取，并且只抽已确认满足 AP 的候选', async () => {
    mockMissMap = new Map([['0-47:4', 0], ['0-48:0', null]]);
    const screen = await render(<MuseDashRandomChartsScreen />);
    mockMissMap = new Map([['0-47:4', 0], ['0-48:0', 3]]);
    await act(async () => { screen.rerender(<MuseDashRandomChartsScreen />); });
    expect(screen.getByText('候选谱面 1 条')).toBeTruthy();
    expect(screen.queryByText('正在核对成就明细…')).toBeNull();
    await fireEvent.press(screen.getByTestId('random-charts-draw'));
    expect(screen.getByTestId('musedash-score-0-47-4')).toBeTruthy();
    expect(screen.queryByTestId('musedash-score-0-48-0')).toBeNull();
    await screen.unmount();
  });

  it('已取到但没有 miss 明细的候选（unknown）不会被当作已满足 AP 抽取', async () => {
    mockMissMap = new Map([['0-47:4', undefined], ['0-48:0', 0]]);
    const screen = await render(<MuseDashRandomChartsScreen />);
    expect(screen.getByText('候选谱面 1 条')).toBeTruthy();
    expect(screen.queryByText('正在核对成就明细…')).toBeNull();
    await fireEvent.press(screen.getByTestId('random-charts-draw'));
    expect(screen.getByTestId('musedash-score-0-48-0')).toBeTruthy();
    expect(screen.queryByTestId('musedash-score-0-47-4')).toBeNull();
    await screen.unmount();
  });

  it('明细请求最终失败时给出可见失败状态与针对性重试，并暂停抽取', async () => {
    mockMissMap = new Map<string, MuseDashMissDetailValue>([['0-47:4', 'failed'], ['0-48:0', 0]]);
    mockFailedDetailCount = 1;
    const screen = await render(<MuseDashRandomChartsScreen />);
    expect(screen.getByText('1 条成就明细读取失败，抽取只使用已确认的结果。')).toBeTruthy();
    expect(screen.getByText('成就明细读取失败，候选不完整。')).toBeTruthy();
    expect(screen.queryByText('正在核对成就明细…')).toBeNull();
    expect(screen.getByTestId('random-charts-draw').props.accessibilityState).toMatchObject({ disabled: true });

    await fireEvent.press(screen.getByLabelText('重试加载随机池'));
    expect(mockRetryFailedDetails).toHaveBeenCalledTimes(1);
    await screen.unmount();
  });

  it('重试成功后恢复抽取，并且只使用已确认满足 AP 的候选', async () => {
    mockFilters = { ...mockFilters, count: 2 };
    mockMissMap = new Map<string, MuseDashMissDetailValue>([['0-47:4', 'failed'], ['0-48:0', 0]]);
    mockFailedDetailCount = 1;
    const screen = await render(<MuseDashRandomChartsScreen />);
    expect(screen.getByTestId('random-charts-draw').props.accessibilityState).toMatchObject({ disabled: true });

    mockMissMap = new Map<string, MuseDashMissDetailValue>([['0-47:4', 0], ['0-48:0', 0]]);
    mockFailedDetailCount = 0;
    await act(async () => { screen.rerender(<MuseDashRandomChartsScreen />); });
    expect(screen.queryByText(/成就明细读取失败/)).toBeNull();
    expect(screen.getByText('候选谱面 2 条')).toBeTruthy();
    expect(screen.getByTestId('random-charts-draw').props.accessibilityState).toMatchObject({ disabled: false });

    await fireEvent.press(screen.getByTestId('random-charts-draw'));
    expect(screen.getByTestId('musedash-score-0-47-4')).toBeTruthy();
    expect(screen.getByTestId('musedash-score-0-48-0')).toBeTruthy();
    await screen.unmount();
  });

  it.each(['albums', 'diffdiff'] as const)('%s 无缓存时等待并展示失败，重试恢复后才允许抽取', async (requiredQuery) => {
    const retry = jest.fn(async () => undefined);
    mockFilters.achievement = 'all';
    mockQueryStates[requiredQuery] = { data: undefined, isLoading: true, refetch: retry };
    const screen = await render(<MuseDashRandomChartsScreen />);
    expect(screen.queryByTestId('random-charts-draw')).toBeNull();
    expect(screen.queryByText('当前曲库没有可抽取谱面')).toBeNull();

    mockQueryStates[requiredQuery] = { data: undefined, isError: true, error: new Error('offline'), refetch: retry };
    await screen.rerender(<MuseDashRandomChartsScreen />);
    expect(screen.getByText('加载失败，请重试')).toBeTruthy();
    await fireEvent.press(screen.getByText('重试'));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(mockRefetch).not.toHaveBeenCalled();

    mockQueryStates = {};
    await screen.rerender(<MuseDashRandomChartsScreen />);
    await fireEvent.press(screen.getByTestId('random-charts-draw'));
    expect(screen.getByTestId('random-charts-results')).toBeTruthy();
    await screen.unmount();
  });

  it('角色资料失败不会阻止抽取，有缓存的曲库和成绩刷新失败仍可使用', async () => {
    const retryCe = jest.fn(async () => undefined);
    mockFilters.achievement = 'all';
    mockFilters.difficultySlot = 4;
    mockQueryStates = {
      ce: { data: undefined, isError: true, error: new Error('offline'), refetch: retryCe },
      albums: { isError: true, error: new Error('offline') },
      diffdiff: { isError: true, error: new Error('offline') },
      player: { isError: true, error: new Error('offline') },
    };
    const screen = await render(<MuseDashRandomChartsScreen />);
    expect(screen.getByText(/角色与精灵资料读取失败/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('random-charts-draw'));
    expect(screen.getByTestId(/musedash-score-/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('重试加载随机池'));
    expect(retryCe).toHaveBeenCalledTimes(1);
    await screen.unmount();
  });

  it('未知成绩允许无成绩筛选的抽取，恢复后更新已抽结果，成绩筛选期间暂停', async () => {
    mockFilters.achievement = 'all';
    mockFilters.difficultySlot = 4;
    mockQueryStates.player = { data: undefined, isLoading: true };
    const screen = await render(<MuseDashRandomChartsScreen />);
    expect(screen.getByText('正在读取成绩…')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('random-charts-draw'));
    expect(screen.getByText('-')).toBeTruthy();
    expect(screen.queryByText('未游玩')).toBeNull();

    const retry = jest.fn(async () => undefined);
    mockFilters.accMin = '90';
    mockQueryStates.player = { data: undefined, isError: true, error: new Error('offline'), refetch: retry };
    await screen.rerender(<MuseDashRandomChartsScreen />);
    expect(screen.getByTestId('random-charts-draw').props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByText('成绩读取失败，请重试。')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('重试加载随机池'));
    expect(retry).toHaveBeenCalledTimes(1);

    mockQueryStates = {};
    await screen.rerender(<MuseDashRandomChartsScreen />);
    expect(screen.getByTestId('random-charts-draw').props.accessibilityState).toMatchObject({ disabled: false });
    expect(screen.getByTestId(/musedash-score-/)).toBeTruthy();
    expect(screen.queryByText('未游玩')).toBeNull();
    await screen.unmount();
  });
});
