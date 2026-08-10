import { fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import type { MuseDashAlbumsResponse, MuseDashCeResponse, MuseDashPlayer } from '@/domain/muse-dash';
import {
  MuseDashBestScreen,
  MuseDashCatalogScreen,
  MuseDashRecordsScreen,
  MuseDashSongDetailScreen,
} from '@/screens/MuseDashScreens';

const mockRefetch = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);
let mockPlayer: MuseDashPlayer | undefined;
let mockAlbums: MuseDashAlbumsResponse | undefined;
let mockCe: MuseDashCeResponse | undefined;
const mockDiffdiff = [
  ['0-47', 3, '11', 640.1, 11.5],
  ['0-47', 4, '12', 739.7, 12.5],
] as [string, number, string, number, number][];

jest.mock('expo-router', () => ({
  router: { push: () => undefined },
  useNavigation: () => ({ canGoBack: () => mockCanGoBack(), goBack: () => mockBack() }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/hooks/use-native-tab-bottom-inset', () => ({ useNativeTabBottomInset: () => 0 }));
jest.mock('@/hooks/use-debounced-value', () => ({ useDebouncedValue: (value: unknown) => value }));
jest.mock('@/theme/app-theme', () => ({ useAppTheme: () => ({
  background: '#F7F8FA', surface: '#FFF', surfaceMuted: '#EEF2F7', border: '#DDD', text: '#111',
  textSecondary: '#4B5563', textMuted: '#666', accent: '#246BFD', accentSoft: '#E8F0FF',
}) }));
jest.mock('@/state/session-store', () => ({ useSession: (selector: (state: unknown) => unknown) => selector({
  activeAccountId: 'musedash:musedash-moe:6ea4f986ffd211e8aa980242ac110011',
  activeGameId: 'musedash',
}) }));
jest.mock('@/hooks/use-muse-dash', () => ({
  useMuseDashPlayer: () => ({ data: mockPlayer, isLoading: false, isError: false, error: null, refetch: mockRefetch }),
  useMuseDashAlbums: () => ({ data: mockAlbums, isLoading: false, isError: false, error: null, refetch: mockRefetch }),
  useMuseDashCe: () => ({ data: mockCe, isLoading: false, isError: false, error: null, refetch: mockRefetch }),
  useMuseDashDiffdiff: () => ({ data: mockDiffdiff, isLoading: false, isError: false, error: null, refetch: mockRefetch }),
}));

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
  ALBUM2: {
    title: 'Second Album', json: 'ALBUM2', tag: 'Pack',
    music: {
      '1-1': {
        uid: '1-1', name: 'Another Track', author: 'Another Author', cover: 'another_cover',
        bpm: '140', levelDesigner: ['Mapper C'], difficulty: ['1', '0', '0', '0', '0'],
      },
    },
  },
};

const ce: MuseDashCeResponse = {
  c: { ChineseS: ['凛·贝斯手', '凛·问题少女', '凛·主唱', '凛·治愈者', '布若'], English: [] },
  e: { ChineseS: ['喵斯', '安吉拉', '塔纳托斯', 'Rabot-233', '莉莉丝', '乌瑞尔', '未命名', '厄普西隆'], English: [] },
};

const player: MuseDashPlayer = {
  lastUpdate: 1786311369798, rl: 3.4518686005869577, diffHistoryNumber: 11,
  plays: [
    { score: 302027, acc: 94.17, i: 1950, platform: 'mobile', history: { lastRank: 1949 }, difficulty: 2, uid: '1-1', sum: 3950, character_uid: '11', elfin_uid: '7' },
    { score: 194166, acc: 97.31, i: 664, platform: 'mobile', history: { lastRank: 664 }, difficulty: 1, uid: '0-47', sum: 1865, character_uid: '7', elfin_uid: '6' },
    { score: 290510, acc: 95.48, i: 1846, platform: 'pc', history: { lastRank: 1845 }, difficulty: 3, uid: '0-47', sum: 3846, character_uid: '3', elfin_uid: '6' },
  ],
  user: { user_id: '6ea4f986ffd211e8aa980242ac110011', nickname: 'SiMOOOOOON' },
};

describe('Muse Dash screens', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlayer = player;
    mockAlbums = albums;
    mockCe = ce;
  });

  it('orders the Best list by community rating (sum) descending', async () => {
    const screen = await render(<MuseDashBestScreen />);
    expect(screen.getAllByLabelText(/^查看谱面/).map((node) => node.props.accessibilityLabel)[0])
      .toContain('Another Track');
    expect(screen.getAllByTestId('musedash-score-0-47-3').length).toBe(1);
    expect(screen.getAllByTestId('musedash-score-1-1-2').length).toBe(1);
  });

  it('filters records by platform and re-sorts by ACC locally', async () => {
    const screen = await render(<MuseDashRecordsScreen />);
    expect(screen.getAllByTestId(/^musedash-score-/)).toHaveLength(3);
    await fireEvent.press(screen.getByLabelText('平台 PC 端'));
    expect(screen.getAllByTestId(/^musedash-score-/)).toHaveLength(1);
    expect(screen.getAllByTestId('musedash-score-0-47-3').length).toBe(1);
    await fireEvent.press(screen.getByLabelText('平台 全部'));
    await fireEvent.press(screen.getByLabelText('排序 ACC'));
    const labels = screen.getAllByLabelText(/^查看谱面/).map((node) => node.props.accessibilityLabel);
    expect(labels[0]).toContain('ACC 97.31%');
  });

  it('searches records by song title and uid', async () => {
    const screen = await render(<MuseDashRecordsScreen />);
    await fireEvent.changeText(screen.getByLabelText('筛选喵斯快跑成绩'), '示例');
    expect(screen.getAllByTestId(/^musedash-score-/)).toHaveLength(2);
    await fireEvent.changeText(screen.getByLabelText('筛选喵斯快跑成绩'), '1-1');
    expect(screen.getAllByTestId(/^musedash-score-/)).toHaveLength(1);
  });

  it('filters the catalog by difficulty slot and searches songs', async () => {
    const screen = await render(<MuseDashCatalogScreen />);
    expect(screen.getAllByLabelText(/^打开歌曲/)).toHaveLength(3);
    await fireEvent.press(screen.getByLabelText('难度 隐藏'));
    expect(screen.getAllByLabelText(/^打开歌曲/)).toHaveLength(1);
    await fireEvent.press(screen.getByLabelText('难度 全部'));
    await fireEvent.changeText(screen.getByLabelText('搜索喵斯快跑歌曲'), 'Another');
    expect(screen.getAllByLabelText(/^打开歌曲/)).toHaveLength(1);
  });

  it('renders detail chart cards with player scores and unplayed notice', async () => {
    const screen = await render(<MuseDashSongDetailScreen songId="0-47" />);
    expect(screen.getByTestId('musedash-chart-0')).toBeTruthy();
    expect(screen.getByTestId('musedash-chart-4')).toBeTruthy();
    expect(screen.getAllByText('290,510').length).toBeGreaterThan(0);
    const unplayed = await render(<MuseDashSongDetailScreen songId="0-48" />);
    expect(unplayed.getByText('当前绑定玩家尚未游玩此曲。')).toBeTruthy();
  });

  it('shows a back button that navigates back when possible', async () => {
    const screen = await render(<MuseDashSongDetailScreen songId="0-47" />);
    await fireEvent.press(screen.getByLabelText('返回'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
