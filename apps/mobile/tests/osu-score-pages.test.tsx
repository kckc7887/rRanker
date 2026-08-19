import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { OsuScoreCard } from '@/components/osu/OsuScoreCard';
import { OsuSongRow } from '@/components/osu/OsuSongRow';
import { OsuBestScreen, OsuCatalogScreen } from '@/screens/OsuScreens';
import type { OsuBestScore } from '@/domain/osu';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
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
  achievedAt: '2026-01-01T00:00:00.000Z',
};

describe('OsuScoreCard 最佳成绩卡', () => {
  it('标题歌名、主信息得分、下方 N★ 难度标签、右侧准确率与 PP', async () => {
    const screen = await render(<OsuScoreCard gameId="osu-standard" score={score} position={1} />);
    expect(screen.getByText('1. Tori no Uta')).toBeTruthy();
    expect(screen.getByText('985,754')).toBeTruthy();
    expect(screen.getByLabelText('难度 7.34★')).toBeTruthy();
    expect(screen.getByText('7.34★')).toBeTruthy();
    expect(screen.getByText('98.52%')).toBeTruthy();
    expect(screen.getByText('73')).toBeTruthy();
  });

  it('右侧 PP 值使用主题色', async () => {
    const screen = await render(<OsuScoreCard gameId="osu-standard" score={score} />);
    const pp = StyleSheet.flatten(screen.getByText('73').props.style);
    expect(pp.color).toBe('#246BFD');
  });

  it('PP 缺失时显示占位符', async () => {
    const screen = await render(<OsuScoreCard gameId="osu-standard" score={{ ...score, pp: null }} />);
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('X 评价渲染 SS 胶囊（#de31ae 白字）', async () => {
    const screen = await render(<OsuScoreCard gameId="osu-standard" score={score} />);
    const tag = screen.getByLabelText('评价 SS');
    const tagStyle = StyleSheet.flatten(tag.props.style);
    expect(tagStyle.backgroundColor).toBe('#de31ae');
    expect(tagStyle.borderRadius).toBe(999);
    expect(StyleSheet.flatten(screen.getByText('SS').props.style).color).toBe('#FFFFFF');
  });

  it('标签行顺序：难度标签在前、评价标签在后', async () => {
    const screen = await render(<OsuScoreCard gameId="osu-standard" score={score} />);
    const row = screen.getByTestId('osu-score-card-tags');
    const labels = row.children.map((child) => (
      typeof child === 'string' ? null : child.props.accessibilityLabel
    ));
    expect(labels).toEqual(['难度 7.34★', '评价 SS']);
  });

  it('银 SS（XH）底色不变、字色 #def3fa', async () => {
    const screen = await render(<OsuScoreCard gameId="osu-standard" score={{ ...score, rank: 'XH' }} />);
    expect(StyleSheet.flatten(screen.getByLabelText('评价 SS').props.style).backgroundColor).toBe('#de31ae');
    expect(StyleSheet.flatten(screen.getByText('SS').props.style).color).toBe('#def3fa');
  });

  it('F 评价底色 #393939、字色 #cc3333', async () => {
    const screen = await render(<OsuScoreCard gameId="osu-standard" score={{ ...score, rank: 'F' }} />);
    const tagStyle = StyleSheet.flatten(screen.getByLabelText('评价 F').props.style);
    expect(tagStyle.backgroundColor).toBe('#393939');
    expect(StyleSheet.flatten(screen.getByText('F').props.style).color).toBe('#cc3333');
  });

  it('未知评价不渲染评价标签，难度标签保留', async () => {
    const screen = await render(<OsuScoreCard gameId="osu-standard" score={{ ...score, rank: 'G' }} />);
    expect(screen.queryByLabelText(/评价/)).toBeNull();
    expect(screen.getByLabelText('难度 7.34★')).toBeTruthy();
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
    const badgeStyle = StyleSheet.flatten(badges[0].props.style);
    expect(badgeStyle.alignSelf).toBe('flex-start');
    expect(badgeStyle.minWidth).toBe(0);
  });

  it('每个难度胶囊按星数取官方连续色阶（不再全部粉色）', async () => {
    const screen = await render(
      <OsuSongRow gameId="osu-standard" song={{
        beatmapSetId: 3720,
        title: 'Tori no Uta',
        artist: 'Lix',
        creator: 'James',
        listCover: null,
        difficultyRatings: [0.9, 3.56, 7.34],
      }} />,
    );
    const badges = screen.getAllByTestId('osu-catalog-difficulty-badge');
    expect(badges).toHaveLength(3);
    // 0.9 → #4BB3FE；3.56 → #F9D760；7.34 → #4240B0（osu-web 连续色阶伽马2.2插值）。
    expect(StyleSheet.flatten(badges[0].props.style).backgroundColor).toBe('#4BB3FE');
    expect(StyleSheet.flatten(badges[1].props.style).backgroundColor).toBe('#F9D760');
    expect(StyleSheet.flatten(badges[2].props.style).backgroundColor).toBe('#4240B0');
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
});

describe('OsuCatalogScreen 曲库页', () => {
  it('搜索框直连 API 关键词并按 beatmapset 渲染歌曲', async () => {
    const screen = await render(<OsuCatalogScreen />);
    expect(screen.getByLabelText('搜索 osu! 谱面')).toBeTruthy();
    expect(screen.getByPlaceholderText('搜索标题、艺术家、谱师或标签')).toBeTruthy();
    expect(screen.getByText('已加载 1 / 1 条')).toBeTruthy();
    expect(screen.getByText('Tori no Uta')).toBeTruthy();
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
