
import { fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { OsuScoreCard } from '@/components/osu/OsuScoreCard';
import { OsuSongRow } from '@/components/osu/OsuSongRow';
import { OsuBestScreen, OsuCatalogScreen, OsuRecordsScreen } from '@/screens/OsuScreens';
import { useOsuRecordsFilter } from '@/state/osu-records-filter';
import type { OsuBestScore } from '@/domain/osu';

const mockRouterPush = jest.fn();

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockRouterPush(...args) },
}));
jest.mock('@/providers/osu-config', () => ({
  ...jest.requireActual<typeof import('@/providers/osu-config')>('@/providers/osu-config'),
  OSU_MOD_ICONS_ROOT: '',
}));
jest.mock('expo-file-system', () => ({
  Directory: class {},
  File: class {},
  Paths: { document: 'mock' },
}));
jest.mock('@/theme/app-theme', () => ({
  useAppTheme: () => ({
    background: '#fff',
    surface: '#fff',
    surfaceMuted: '#f5f5f5',
    input: '#fff',
    border: '#ddd',
    text: '#111',
    textSecondary: '#444',
    textMuted: '#777',
    accent: '#246BFD',
    accentSoft: '#E8F0FF',
    dark: false,
  }),
}));
jest.mock('@/hooks/use-native-tab-bottom-inset', () => ({ useNativeTabBottomInset: () => 0 }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('react-native-gesture-handler', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return { GestureHandlerRootView: RN.View, Pressable: RN.Pressable };
});

const score: OsuBestScore = {
  id: 166715063,
  score: 985754,
  accuracy: 0.9852,
  maxCombo: 450,
  pp: 72.9787,
  rank: 'X',
  beatmap: {
    id: 22423,
    beatmapSetId: 3720,
    difficultyRating: 7.34,
    version: 'Insane',
  },
  beatmapset: {
    id: 3720,
    title: 'Tori no Uta',
    artist: 'Lix',
    creator: 'James',
    listCover: 'https://assets.ppy.sh/beatmaps/3720/covers/list.jpg',
  },
  statistics: { perfect: 520, great: 12, good: 3, ok: 1, meh: 0, miss: 0 },
  mods: ['HD', 'DT'],
  achievedAt: '2026-01-01T00:00:00.000Z',
};

let mockDemo = false;
let mockDemoScores: OsuBestScore[] = [];
let mockDemoPageFailed = false;
let mockDemoHasNextPage = true;
const mockFetchDemoNext = jest.fn(async () => undefined);
jest.mock('@/hooks/use-osu-demo-scores', () => ({
  useOsuDemoScores: () => ({ bound: mockDemo, scores: mockDemoScores, isPending: false, isError: false,
    error: null, isRefetching: false, refetch: jest.fn(), hasNextPage: mockDemoHasNextPage, isFetchingNextPage: false,
    isFetchNextPageError: mockDemoPageFailed, fetchNextPage: mockFetchDemoNext }),
}));
beforeEach(() => {
  mockDemo = false; mockDemoScores = []; mockDemoPageFailed = false; mockDemoHasNextPage = true;
  mockFetchDemoNext.mockReset().mockResolvedValue(undefined);
});

jest.mock('@/hooks/use-osu-known-scores', () => ({ useOsuKnownScores: jest.fn() }));
const { useOsuKnownScores } = jest.requireMock<typeof import('@/hooks/use-osu-known-scores')>(
  '@/hooks/use-osu-known-scores',
);
(useOsuKnownScores as jest.Mock).mockReturnValue({
  bound: true,
  data: [score],
  isLoading: false,
  isError: false,
  isRefetching: false,
  error: null,
  refetch: jest.fn(),
});

describe('OsuScoreCard 最佳成绩卡', () => {
  it('标题歌名、主信息得分、下方 N★ 难度标签、右侧准确率与 PP', async () => {
    const screen = await render(<OsuScoreCard gameId="osu-standard" score={score} position={1} />);
    expect(screen.getByText('1. Tori no Uta')).toBeTruthy();
    expect(screen.getByText('985,754')).toBeTruthy();
    expect(screen.getByLabelText('难度 7.34★')).toBeTruthy();
    expect(screen.getByText('7.34★')).toBeTruthy();
    expect(screen.getByText('98.52%')).toBeTruthy();
    expect(screen.getByText('73')).toBeTruthy();
    expect(screen.getByText('SS')).toBeTruthy();
    expect(screen.getByTestId('osu-mod-badge-HD')).toBeTruthy();
    expect(screen.getByTestId('osu-mod-badge-DT')).toBeTruthy();
  });

  it('PP 缺失时显示占位符', async () => {
    const screen = await render(<OsuScoreCard gameId="osu-standard" score={{ ...score, pp: null }} />);
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('空 mods 不渲染任何模组徽章', async () => {
    const screen = await render(
      <OsuScoreCard gameId="osu-standard" score={{ ...score, mods: [] }} />,
    );
    expect(screen.queryAllByTestId(/osu-mod-badge-/)).toHaveLength(0);
  });

  it('未知模组 acronym 静默跳过，已知模组保留', async () => {
    const screen = await render(
      <OsuScoreCard gameId="osu-standard" score={{ ...score, mods: ['HD', 'ZZ'] }} />,
    );
    expect(screen.getByTestId('osu-mod-badge-HD')).toBeTruthy();
    expect(screen.queryByTestId('osu-mod-badge-ZZ')).toBeNull();
  });

  it('未知评价不渲染评价标签，难度标签保留', async () => {
    const screen = await render(<OsuScoreCard gameId="osu-standard" score={{ ...score, rank: 'G' }} />);
    expect(screen.queryByLabelText(/评价/)).toBeNull();
    expect(screen.getByLabelText('难度 7.34★')).toBeTruthy();
  });

  it('成绩页成绩卡进入详情时附加 scoreId，最佳页旧入口保持无该参数', async () => {
    const records = await render(
      <OsuScoreCard gameId="osu-standard" score={score} detailScoreId={score.id} />,
    );
    await fireEvent.press(records.getByTestId(`osu-score-card-${score.id}`));
    expect(mockRouterPush).toHaveBeenLastCalledWith({
      pathname: '/songs/[songId]',
      params: { songId: '3720', beatmapId: '22423', scoreId: String(score.id), gameId: 'osu-standard' },
    });
    await records.unmount();

    const best = await render(<OsuScoreCard gameId="osu-standard" score={score} />);
    await fireEvent.press(best.getByTestId(`osu-score-card-${score.id}`));
    expect(mockRouterPush).toHaveBeenLastCalledWith({
      pathname: '/songs/[songId]',
      params: { songId: '3720', beatmapId: '22423', gameId: 'osu-standard' },
    });
  });
});

describe('OsuSongRow 曲库行', () => {
  it('难度标签为该 set 全部难度升序的空胶囊（不显示任何字，仅占位宽度）', async () => {
    const screen = await render(
      <OsuSongRow gameId="osu-standard" song={{
        beatmapSetId: 3720,
        title: 'Tori no Uta',
        artist: 'Lix',
        creator: 'James',
        listCover: null,
        difficultyRatings: [3.56, 7.34],
      }} />,
    );
    expect(screen.getByText('Tori no Uta')).toBeTruthy();
    expect(screen.getByText('Lix')).toBeTruthy();
    expect(screen.getAllByText(' ')).toHaveLength(2);
    const badges = screen.getAllByTestId('osu-catalog-difficulty-badge');
    expect(badges).toHaveLength(2);
  });

  it('无难度时不渲染任何胶囊', async () => {
    const screen = await render(
      <OsuSongRow gameId="osu-standard" song={{
        beatmapSetId: 3720,
        title: 'Tori no Uta',
        artist: 'Lix',
        creator: 'James',
        listCover: null,
        difficultyRatings: [],
      }} />,
    );
    expect(screen.queryAllByTestId('osu-catalog-difficulty-badge')).toHaveLength(0);
  });
});

jest.mock('@/hooks/use-game-data', () => ({
  useGameData: () => ({
    data: {
      gameId: 'osu-standard',
      providerId: 'osu',
      profile: {
        id: 'osu-standard',
        title: 'osu!standard',
        ratingLabel: 'PP',
        ratingDigits: 0,
        bestSections: [],
        capabilities: {},
      },
      payload: {
        kind: 'osu',
        player: {
          userId: 2,
          username: 'peppy',
          avatarUrl: null,
          pp: 1175.66,
          accuracy: 0.968413,
          playTimeSeconds: 744884,
          playCount: 7769,
          globalRank: 755659,
        },
        bestScores: [score],
        playerScore: { label: 'PP', value: 1175.66, display: '1,176' },
        source: { kind: 'osu', label: 'osu.ppy.sh', updatedAt: '2026-01-01T00:00:00.000Z', isStale: false },
      },
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  }),
}));
jest.mock('@/state/session-store', () => ({
  useSession: (selector: (state: Record<string, unknown>) => unknown) => selector({
    activeGameId: 'osu-standard',
    activeAccountId: 'osu-standard:osu:2',
  }),
}));

const catalogSong = {
  beatmapSetId: 3720,
  title: 'Tori no Uta',
  artist: 'Lix',
  creator: 'James',
  listCover: null,
  difficultyRatings: [3.56, 7.34],
};

jest.mock('@/hooks/use-osu-catalog', () => ({
  useOsuCatalogSearch: jest.fn(() => ({
    bound: true,
    songs: [catalogSong],
    total: 1,
    recommendedDifficulty: 4.72,
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: jest.fn(),
  })),
}));

describe('OsuBestScreen 最佳页', () => {
  it('单分区标题 Top 100 并渲染成绩卡', async () => {
    const screen = await render(<OsuBestScreen />);
    expect(screen.getByText('Top 100')).toBeTruthy();
    expect(screen.getByText('1 条成绩')).toBeTruthy();
    expect(screen.getByText('1. Tori no Uta')).toBeTruthy();
  });

  it('示例最佳页显示全部已加载成绩及后页重试，不截取 Top 100', async () => {
    mockDemo = true;
    mockDemoScores = Array.from({ length: 101 }, (_, index) => ({ ...score, id: index + 1,
      beatmapset: { ...score.beatmapset, title: `示例歌曲 ${index + 1}` } }));
    mockDemoPageFailed = true;
    const screen = await render(<OsuBestScreen />);
    expect(screen.getByText('最佳成绩')).toBeTruthy();
    expect(screen.getByText('101 条成绩')).toBeTruthy();
    expect(screen.queryByText('Top 100')).toBeNull();
    expect(screen.getByText('1. 示例歌曲 1')).toBeTruthy();
    await fireEvent.press(screen.getByText('后页加载失败，点此重试'));
    expect(mockFetchDemoNext).toHaveBeenCalled();
  });

  it('示例首页没有可用成绩时仍可继续加载后页', async () => {
    mockDemo = true;
    mockFetchDemoNext.mockImplementation(async () => {
      mockDemoScores = [score]; mockDemoHasNextPage = false;
    });
    const screen = await render(<OsuBestScreen />);
    expect(screen.getByText('当前账号暂无最佳成绩')).toBeTruthy();
    await fireEvent.press(screen.getByText('继续加载'));
    await screen.rerender(<OsuBestScreen />);
    expect(await screen.findByText('1. Tori no Uta')).toBeTruthy();
    expect(screen.queryByText('继续加载')).toBeNull();
  });
});

describe('OsuRecordsScreen 成绩页', () => {
  beforeEach(() => {
    useOsuRecordsFilter.getState().reset();
  });

  it('示例成绩使用同一分页来源，滚到底部继续读取', async () => {
    mockDemo = true;
    mockDemoScores = [{ ...score, beatmapset: { ...score.beatmapset, title: '示例歌曲' } }];
    const screen = await render(<OsuRecordsScreen />);
    expect(await screen.findByText('示例歌曲')).toBeTruthy();
    expect(screen.queryByText('Tori no Uta')).toBeNull();
    await fireEvent(screen.getByTestId('osu-records-results-list'), 'endReached');
    expect(mockFetchDemoNext).toHaveBeenCalled();
  });

  it('示例当前页筛选无匹配时可继续后页取得目标成绩', async () => {
    mockDemo = true; mockDemoScores = [score];
    const target = { ...score, id: score.id + 1, beatmapset: { ...score.beatmapset, title: '后页目标曲' } };
    mockFetchDemoNext.mockImplementation(async () => {
      mockDemoScores = [score, target]; mockDemoHasNextPage = false;
    });
    const screen = await render(<OsuRecordsScreen />);
    await fireEvent.changeText(screen.getByPlaceholderText('搜索歌名、艺术家或谱面名'), '后页目标曲');
    expect(await screen.findByText('没有找到符合条件的已知成绩')).toBeTruthy();
    await fireEvent.press(screen.getByText('继续加载'));
    await screen.rerender(<OsuRecordsScreen />);
    expect(await screen.findByText('后页目标曲')).toBeTruthy();
    expect(screen.queryByText('Tori no Uta')).toBeNull();
    expect(screen.queryByText('继续加载')).toBeNull();
  });

  it('渲染搜索框、收起态筛选栏与全部成绩', async () => {
    const screen = await render(<OsuRecordsScreen />);
    expect(screen.getByLabelText('搜索 osu! 成绩')).toBeTruthy();
    expect(screen.getByPlaceholderText('搜索歌名、艺术家或谱面名')).toBeTruthy();
    expect(screen.getByLabelText('展开 osu! 成绩筛选，当前 全部')).toBeTruthy();
    expect(screen.queryByText('已知成绩')).toBeNull();
    expect(screen.queryByText('打开曲库歌曲后，会自动补充查询到的成绩')).toBeNull();
    expect(await screen.findByText('已加载 1 / 1 条')).toBeTruthy();
    expect(await screen.findByText('Tori no Uta')).toBeTruthy();
  });

  it('筛选为空结果时切换空态文案，重置后恢复', async () => {
    const screen = await render(<OsuRecordsScreen />);
    await fireEvent.press(screen.getByLabelText('展开 osu! 成绩筛选，当前 全部'));
    await fireEvent.press(screen.getByLabelText('osu! 成绩模组筛选，当前 全部'));
    const noneOption = await screen.findByLabelText('NM 无模组，未选中');
    await fireEvent.press(noneOption);
    await fireEvent.press(screen.getByLabelText('完成 osu! 模组筛选'));
    expect(await screen.findByText('没有找到符合条件的已知成绩')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('重置 osu! 成绩筛选'));
    expect(await screen.findByText('Tori no Uta')).toBeTruthy();
  });

  it('PP 下限筛选收窄列表', async () => {
    const screen = await render(<OsuRecordsScreen />);
    await fireEvent.press(screen.getByLabelText('展开 osu! 成绩筛选，当前 全部'));
    await fireEvent.changeText(screen.getByLabelText('最低 PP'), '100');
    expect(await screen.findByText('没有找到符合条件的已知成绩')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('最低 PP'), '50');
    expect(await screen.findByText('Tori no Uta')).toBeTruthy();
  });
});

describe('OsuCatalogScreen 曲库页', () => {
  it('搜索框直连 API 关键词并按 beatmapset 渲染歌曲', async () => {
    const screen = await render(<OsuCatalogScreen />);
    expect(screen.getByLabelText('搜索 osu! 谱面')).toBeTruthy();
    expect(screen.getByPlaceholderText('搜索标题、艺术家、谱师或标签')).toBeTruthy();
    expect(await screen.findByText('已加载 1 / 1 条')).toBeTruthy();
    expect(await screen.findByText('Tori no Uta')).toBeTruthy();
    expect(screen.getAllByTestId('osu-catalog-difficulty-badge')).toHaveLength(2);
  });

  it('筛选器不含任何模式控件（m 对玩家不可见不可改）', async () => {
    const screen = await render(<OsuCatalogScreen />);
    expect(screen.queryByText('模式')).toBeNull();
    await fireEvent.press(screen.getByLabelText('展开 osu! 筛选，当前 全部'));
    expect(screen.queryByText('模式')).toBeNull();
    expect(screen.getByLabelText('osu! 常规筛选，当前 全部')).toBeTruthy();
    expect(screen.getByLabelText('osu! 分类筛选，当前 全部')).toBeTruthy();
    expect(screen.getByLabelText('osu! 流派筛选，当前 全部')).toBeTruthy();
    expect(screen.getByLabelText('osu! 语言筛选，当前 全部')).toBeTruthy();
    expect(screen.getByLabelText('osu! 不良内容筛选，当前 隐藏')).toBeTruthy();
    expect(screen.getByLabelText('osu! 其他筛选，当前 全部')).toBeTruthy();
  });

  it('未绑定 osu 账号时提示绑定且不发请求渲染', async () => {
    const { useOsuCatalogSearch } = jest.requireMock<typeof import('@/hooks/use-osu-catalog')>('@/hooks/use-osu-catalog');
    (useOsuCatalogSearch as jest.Mock).mockReturnValueOnce({
      bound: false,
      songs: [],
      total: undefined,
      recommendedDifficulty: null,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: jest.fn(),
    });
    const screen = await render(<OsuCatalogScreen />);
    expect(screen.getByText('请先在游戏管理中绑定 osu! 账号')).toBeTruthy();
  });
});
