import { act, fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { MuseDashRandomChartsScreen } from '@/screens/MuseDashRandomChartsScreen';
import type {
  MuseDashAlbumsResponse,
  MuseDashAchievementFilter,
  MuseDashCeResponse,
  MuseDashPlayer,
} from '@/domain/muse-dash';

const mockRefetch = jest.fn(async () => ({ data: undefined }));
let mockMissMap: ReadonlyMap<string, number | null | undefined> = new Map();
let mockFilters = {
  count: 1 as const, collapsed: true, difficultySlot: 'all' as const, dlc: 'all' as const,
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
  const query = (data: unknown) => ({
    data,
    source: { kind: 'musedash', label: 'MuseDash.moe', updatedAt: '2026-08-10T00:00:00.000Z', isStale: false },
    isLoading: false, isError: false, error: null, isFetching: false, refetch: mockRefetch,
  });
  return {
    useMuseDashPlayer: () => query(player),
    useMuseDashAlbums: () => query(albums),
    useMuseDashCe: () => query(ce),
    useMuseDashDiffdiff: () => query(diffdiff),
    useMuseDashPlayDetail: () => query(undefined),
    useMuseDashPlayDetails: () => mockMissMap,
  };
});

describe('Muse Dash random charts achievement gating', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMissMap = new Map();
    mockFilters = { ...mockFilters, achievement: 'ap' };
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
});
