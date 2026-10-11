import { fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { Platform, StyleSheet } from 'react-native';
import { OsuScoreCard } from '@/components/osu/OsuScoreCard';
import { buildOsuBeatmapMetricRows, OsuSongDetail } from '@/components/osu/OsuSongDetail';
import { OsuSongRow } from '@/components/osu/OsuSongRow';
import type { OsuBeatmapsetDetail, OsuBestScore } from '@/domain/osu';
import type { UserLibraryItem } from '@/domain/user-library';
import { ProviderError } from '@/providers/errors';

const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockSetSongFavorite = jest.fn(async () => undefined);
const mockSetChartPractice = jest.fn(async () => undefined);
const mockSetTags = jest.fn(async () => undefined);
const mockSetTagPresets = jest.fn(async () => undefined);
const mockDetailRefetch = jest.fn(async () => undefined);
const mockShowActionNotification = jest.fn();
const mockDownloadOsuBeatmapsetPackage = jest.fn(async (_request: unknown, _options: unknown) => true);
const mockStartDownload = jest.fn(async (
  runner: (options: Record<string, unknown>) => Promise<boolean>,
) => runner({}));
let mockRecentScores: OsuBestScore[] = [];

const hardScore: OsuBestScore = {
  id: 166715063,
  score: 985754,
  accuracy: 0.9852,
  maxCombo: 450,
  pp: 72.9787,
  rank: 'X',
  beatmap: { id: 22423, beatmapSetId: 3720, difficultyRating: 5.5, version: 'Hard' },
  beatmapset: { id: 3720, title: '鳥の詩', artist: 'Lia', creator: 'James', listCover: null },
  statistics: { perfect: 520, great: 12, good: 3, ok: 1, meh: null, miss: null },
  mods: ['HD', 'DT'],
  achievedAt: '2026-01-01T00:00:00.000Z',
};

const currentScore: OsuBestScore = {
  id: 166715064,
  score: 1111111,
  accuracy: 0.96,
  maxCombo: 300,
  pp: 55.4,
  rank: 'S',
  beatmap: { id: 22427, beatmapSetId: 3720, difficultyRating: 4.3, version: 'Normal' },
  beatmapset: { id: 3720, title: '鳥の詩', artist: 'Lia', creator: 'James', listCover: null },
  statistics: null,
  mods: [],
  achievedAt: null,
};

const detail: OsuBeatmapsetDetail = {
  beatmapSetId: 3720,
  title: '鳥の詩',
  artist: 'Lia',
  creator: 'James',
  cover: 'https://assets.ppy.sh/beatmaps/3720/covers/card@2x.jpg',
  status: 'ranked',
  genreName: '动漫',
  languageName: '日语',
  rating: 4.8,
  favouriteCount: 1234,
  tags: ['anime', 'vocal', 'aah'],
  beatmaps: [
    {
      id: 22424, version: 'Insane', difficultyRating: 6.9, mode: 'osu',
      totalLength: 200, bpm: 210, cs: 3.5, drain: 5, accuracy: 7, ar: 8,
      countCircles: 800, countSliders: 90, countSpinners: 2, maxCombo: 900,
    },
    {
      id: 22423, version: 'Hard', difficultyRating: 5.5, mode: 'osu',
      totalLength: 129, bpm: 180.4, cs: 4, drain: 6, accuracy: 8, ar: 9,
      countCircles: 520, countSliders: 12, countSpinners: 3, maxCombo: 450,
    },
    {
      id: 22427, version: 'Normal', difficultyRating: 4.3, mode: 'osu',
      totalLength: 150, bpm: 160, cs: 3, drain: 4, accuracy: 6, ar: 7,
      countCircles: 400, countSliders: 40, countSpinners: 1, maxCombo: 350,
    },
    {
      id: 22425, version: 'Easy', difficultyRating: 2.1, mode: 'osu',
      totalLength: 100, bpm: 150, cs: 2, drain: 3, accuracy: 5, ar: 6,
      countCircles: 300, countSliders: 30, countSpinners: 1, maxCombo: 250,
    },
  ],
};

function osuGameData(pp: number) {
  return {
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
        pp,
        accuracy: 0.97,
        playTimeSeconds: 100000,
        playCount: 1000,
        globalRank: 1000,
      },
      bestScores: [hardScore, currentScore],
      playerScore: { label: 'PP', value: pp, display: String(pp) },
      source: { kind: 'osu', label: 'osu.ppy.sh', updatedAt: '2026-01-01T00:00:00.000Z', isStale: false },
    },
  };
}

let mockDetailState: {
  data?: OsuBeatmapsetDetail;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
} = { data: detail, isLoading: false, isError: false, error: null };
let mockGameData: { data?: ReturnType<typeof osuGameData> } = { data: osuGameData(5000) };
let mockActiveGameId = 'osu-standard';
let mockLibraryItems: UserLibraryItem[] = [];

jest.mock('expo-router', () => ({
  router: {
    replace: (href: unknown) => mockReplace(href),
    push: (href: unknown) => mockPush(href),
  },
  useNavigation: () => ({
    canGoBack: mockCanGoBack,
    goBack: mockBack,
  }),
}));
jest.mock('expo-image', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Image: ({ source: imageSource, ...props }: { source?: unknown }) => (
      <RN.Image {...props} source={{ uri: String(imageSource) }} />
    ),
  };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('@/providers/osu-config', () => ({
  ...jest.requireActual<typeof import('@/providers/osu-config')>('@/providers/osu-config'),
  OSU_MOD_ICONS_ROOT: '',
}));
jest.mock('expo-file-system', () => ({
  Directory: class {},
  File: class {},
  Paths: { document: 'mock' },
}));
jest.mock('react-native-gesture-handler', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    GestureHandlerRootView: RN.View,
    Pressable: (props: React.ComponentProps<typeof RN.Pressable>) => React.createElement(
      RN.Pressable,
      { ...props, accessibilityHint: 'gesture-handler', testID: props.testID ?? 'gesture-handler-pressable' },
    ),
    ScrollView: RN.ScrollView,
  };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, right: 0, bottom: 34, left: 0 }),
}));
jest.mock('@/theme/app-theme', () => ({
  useAppTheme: () => ({
    dark: false,
    accent: '#246BFD',
    accentSoft: '#EAF1FF',
    background: '#F7F8FA',
    surface: '#FFFFFF',
    surfaceMuted: '#EEF2F7',
    input: '#FFFFFF',
    border: '#D1D5DB',
    text: '#111827',
    textSecondary: '#4B5563',
    textMuted: '#6B7280',
    danger: '#B42318',
  }),
}));
jest.mock('@/state/session-store', () => ({
  useSession: (selector: (state: Record<string, unknown>) => unknown) => selector({
    activeGameId: mockActiveGameId,
    activeAccountId: `${mockActiveGameId}:osu:2`,
  }),
}));
jest.mock('@/hooks/use-osu-beatmapset-detail', () => ({
  useOsuBeatmapsetDetail: () => ({
    ...mockDetailState,
    refetch: mockDetailRefetch,
  }),
}));
jest.mock('@/components/AppNotification', () => ({
  ...jest.requireActual<typeof import('@/components/AppNotification')>('@/components/AppNotification'),
  useNotification: () => ({ showActionNotification: mockShowActionNotification }),
}));
jest.mock('@/features/chart-download-shared/use-chart-package-download', () => ({
  useChartPackageDownload: () => ({ isRunning: false, start: mockStartDownload }),
}));
jest.mock('@/features/osu-beatmapset-download/osu-beatmapset-download', () => ({
  downloadOsuBeatmapsetPackage: (request: unknown, options: unknown) => (
    mockDownloadOsuBeatmapsetPackage(request, options)
  ),
}));
jest.mock('@/hooks/use-osu-known-scores', () => ({
  useOsuKnownScores: (_gameId: unknown, seedScores: OsuBestScore[] = []) => ({
    data: mockRecentScores.length > 0 ? mockRecentScores : seedScores,
    bound: true,
    isLoading: false,
  }),
  useOsuBeatmapsetUserScores: () => ({ data: [], isLoading: false }),
}));
jest.mock('@/hooks/use-game-data', () => ({
  useGameData: () => ({
    data: mockGameData.data,
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  }),
}));
jest.mock('@/hooks/use-user-library', () => ({
  useUserLibrary: () => ({
    data: mockLibraryItems,
    isLoading: false,
    isUpdating: false,
    songKey: (songId: string) => `song:osu:${songId}`,
    chartKey: (songId: string, type: string, levelIndex: number) => (
      `chart:osu:${songId}:${type}:${levelIndex}`
    ),
    setSongFavorite: mockSetSongFavorite,
    setChartPractice: mockSetChartPractice,
    setTags: mockSetTags,
    setTagPresets: mockSetTagPresets,
    tagPresets: [],
  }),
}));

describe('OsuSongDetail 歌曲详情页', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
    mockRecentScores = [];
    mockDetailState = { data: detail, isLoading: false, isError: false, error: null };
    mockGameData = { data: osuGameData(5000) };
    mockActiveGameId = 'osu-standard';
    mockLibraryItems = [];
  });

  it('渲染 Hero/简要信息栏/歌曲信息卡与 Hard 难度卡完整内容', async () => {
    const screen = await render(<OsuSongDetail beatmapsetId="3720" />);

    expect(screen.getByText('#3720')).toBeTruthy();
    expect(screen.getByText('鳥の詩')).toBeTruthy();
    expect(screen.getByText('Lia')).toBeTruthy();

    expect(screen.getByText('分类')).toBeTruthy();
    expect(screen.getByTestId('osu-metadata-value-分类').props.children).toBe('上架');
    expect(screen.getByText('流派')).toBeTruthy();
    expect(screen.getByTestId('osu-metadata-value-流派').props.children).toBe('动漫');
    expect(screen.getByText('语言')).toBeTruthy();
    expect(screen.getByTestId('osu-metadata-value-语言').props.children).toBe('日语');

    expect(screen.getByTestId('osu-song-info-card')).toBeTruthy();
    expect(screen.getByText('歌曲信息')).toBeTruthy();
    expect(screen.getByText('标签')).toBeTruthy();
    expect(screen.getByText('anime')).toBeTruthy();
    expect(screen.getByText('vocal')).toBeTruthy();
    expect(screen.getByText('aah')).toBeTruthy();
    expect(screen.getByText('玩家评价：4.8 分')).toBeTruthy();

    const hard = within(screen.getByTestId('osu-detail-difficulty-22423'));
    expect(hard.getByText('Hard')).toBeTruthy();
    expect(hard.getByText('5.50')).toBeTruthy();
    expect(hard.getByText('★')).toBeTruthy();
    expect(hard.getByText('Score')).toBeTruthy();
    expect(hard.getByText('985,754')).toBeTruthy();
    expect(hard.getByTestId('osu-detail-rank-X')).toBeTruthy();
    expect(hard.getByText('SS')).toBeTruthy();
    expect(hard.getByText('准确率')).toBeTruthy();
    expect(hard.getByText('98.52%')).toBeTruthy();
    expect(hard.getByText('最大连击')).toBeTruthy();
    expect(hard.getByText('450x')).toBeTruthy();
    expect(hard.getByText('时长')).toBeTruthy();
    expect(hard.getByText('2:09')).toBeTruthy();
    expect(hard.getByText('BPM')).toBeTruthy();
    expect(hard.getByText('180')).toBeTruthy();
    expect(hard.getByText('谱师')).toBeTruthy();
    expect(hard.getByText('James')).toBeTruthy();
    expect(hard.getByText('达成时间：2026-01-01')).toBeTruthy();
    expect(hard.getByText('圆圈总数')).toBeTruthy();
    expect(hard.getByText('滑条总数')).toBeTruthy();
    expect(hard.queryByText(/按键数量/)).toBeNull();
    expect(hard.getByText('掉血速度')).toBeTruthy();
    expect(hard.getByText('准度要求')).toBeTruthy();
    expect(hard.getByText('圆圈大小')).toBeTruthy();
    expect(hard.getByText('缩圈速度')).toBeTruthy();
    expect(hard.queryByText(/^LV \d/)).toBeNull();
    expect(hard.queryByText(/定数/)).toBeNull();

    const notes = within(hard.getByLabelText('osu 判定统计'));
    for (const key of ['perfect', 'great', 'good', 'ok', 'meh', 'miss'] as const) {
      expect(notes.getByTestId(`osu-judgement-${key}`)).toBeTruthy();
    }
    expect(notes.getByText('PERFECT')).toBeTruthy();
    expect(notes.getByText('GREAT')).toBeTruthy();
    expect(notes.getByText('GOOD')).toBeTruthy();
    expect(notes.getByText('OK')).toBeTruthy();
    expect(notes.getByText('MEH')).toBeTruthy();
    expect(notes.getByText('MISS')).toBeTruthy();
    expect(notes.getByText('PP')).toBeTruthy();
    expect(notes.getByText('520')).toBeTruthy();
    expect(notes.getByText('12')).toBeTruthy();
    expect(notes.getByText('3')).toBeTruthy();
    expect(notes.getByText('1')).toBeTruthy();
    expect(notes.getAllByText('—')).toHaveLength(2);
    expect(notes.getByText('73')).toBeTruthy();
    expect(JSON.stringify(notes.getByText('520').props.style)).toContain('#66CCFF');
    expect(JSON.stringify(within(notes.getByTestId('osu-judgement-miss')).getByText('—').props.style))
      .toContain('#FF6666');

    const carousel = screen.getByLabelText('osu 难度卡片');
    const interval = carousel.props.snapToInterval;
    expect(interval).toBeGreaterThan(0);
    expect(carousel.props.contentOffset.x).toBe(interval);

    await fireEvent.press(screen.getByLabelText('返回'));
    expect(mockBack).toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('收藏 鳥の詩'));
    expect(mockSetSongFavorite).toHaveBeenCalledWith('3720', true);
  });

  it('pp=5000 默认定位到推荐星级最近的 5.5★ 卡片（次序与偏移）', async () => {
    const screen = await render(<OsuSongDetail beatmapsetId="3720" />);
    const carousel = screen.getByLabelText('osu 难度卡片');
    expect(carousel.props.contentOffset.x).toBe(carousel.props.snapToInterval);
    expect(within(screen.getByTestId('osu-detail-difficulty-22424')).getByText('6.90')).toBeTruthy();
  });

  it('成绩卡带入 beatmap id 时优先定位该难度（覆盖推荐难度）', async () => {
    const screen = await render(<OsuSongDetail beatmapsetId="3720" initialBeatmapId={22427} />);
    const carousel = screen.getByLabelText('osu 难度卡片');
    expect(carousel.props.contentOffset.x).toBe(carousel.props.snapToInterval * 2);
    const fallback = await render(<OsuSongDetail beatmapsetId="3720" initialBeatmapId={99999} />);
    expect(fallback.getByLabelText('osu 难度卡片').props.contentOffset.x)
      .toBe(fallback.getByLabelText('osu 难度卡片').props.snapToInterval);
  });

  it('快照未加载（payload undefined）时推荐 1.0★，定位到最近的 2.1★ 卡片', async () => {
    mockGameData = { data: undefined };
    const screen = await render(<OsuSongDetail beatmapsetId="3720" />);
    const carousel = screen.getByLabelText('osu 难度卡片');
    expect(carousel.props.contentOffset.x).toBe(carousel.props.snapToInterval * 3);
  });

  it('pp=0 同样回退 1.0★ 推荐星级', async () => {
    mockGameData = { data: osuGameData(0) };
    const screen = await render(<OsuSongDetail beatmapsetId="3720" />);
    const carousel = screen.getByLabelText('osu 难度卡片');
    expect(carousel.props.contentOffset.x).toBe(carousel.props.snapToInterval * 3);
  });

  it('未游玩难度：得分/准确率/连击/判定六列/PP 为 —，时长与 BPM 正常，不渲染评价标签', async () => {
    const screen = await render(<OsuSongDetail beatmapsetId="3720" initialBeatmapId={22425} />);
    const easy = within(screen.getByTestId('osu-detail-difficulty-22425'));
    expect(easy.getAllByText('—')).toHaveLength(10);
    expect(easy.getByText('达成时间：—')).toBeTruthy();
    expect(easy.getByText('1:40')).toBeTruthy();
    expect(easy.getByText('150')).toBeTruthy();
    const notes = within(easy.getByLabelText('osu 判定统计'));
    expect(notes.getAllByText('—')).toHaveLength(7);
    expect(easy.queryAllByLabelText(/^评价 /)).toHaveLength(0);
  });

  it('当前成绩无判定或达成时间时显示 —，得分/准确率/PP 正常', async () => {
    const screen = await render(<OsuSongDetail beatmapsetId="3720" />);
    const normal = within(screen.getByTestId('osu-detail-difficulty-22427'));
    expect(normal.getByText('1,111,111')).toBeTruthy();
    expect(normal.getByText('96.00%')).toBeTruthy();
    expect(normal.getByText('300x')).toBeTruthy();
    expect(normal.getByText('达成时间：—')).toBeTruthy();
    const notes = within(normal.getByLabelText('osu 判定统计'));
    expect(notes.getAllByText('—')).toHaveLength(6);
    expect(notes.getByText('PP')).toBeTruthy();
    expect(notes.getByText('55')).toBeTruthy();
    expect(normal.getByTestId('osu-detail-rank-S')).toBeTruthy();
  });

  it('难度卡模组徽章：有成绩的难度渲染评价标签后的模组圆徽（文字回退形态）', async () => {
    const screen = await render(<OsuSongDetail beatmapsetId="3720" />);
    const hard = within(screen.getByTestId('osu-detail-difficulty-22423'));
    const hd = hard.getByTestId('osu-mod-badge-HD');
    const hdVisual = within(hd).getByText('HD').parent;
    const hdStyle = StyleSheet.flatten(hdVisual?.props.style);
    expect(hdStyle.backgroundColor).toBe('#FF6666');
    expect(hdStyle.borderRadius).toBe(11);
    expect(hard.getByTestId('osu-mod-badge-DT')).toBeTruthy();
    const badgeRow = hd.parent;
    expect(badgeRow).toBeTruthy();
    const badgeRowChildren = badgeRow?.children ?? [];
    expect(badgeRowChildren.indexOf(hard.getByTestId('osu-detail-rank-X')))
      .toBeLessThan(badgeRowChildren.indexOf(hd));
    const normal = within(screen.getByTestId('osu-detail-difficulty-22427'));
    expect(normal.queryAllByTestId(/osu-mod-badge-/)).toHaveLength(0);
    const carousel = screen.getByLabelText('osu 难度卡片');
    await fireEvent.scroll(carousel, { nativeEvent: { contentOffset: { x: 3 * carousel.props.snapToInterval } } });
    const easy = within(screen.getByTestId('osu-detail-difficulty-22425'));
    expect(easy.queryAllByTestId(/osu-mod-badge-/)).toHaveLength(0);
  });

  it('难度卡模组徽章可点击并使用当前模式的官方 Wiki 中文摘要', async () => {
    const screen = await render(<OsuSongDetail beatmapsetId="3720" />);
    const hard = within(screen.getByTestId('osu-detail-difficulty-22423'));
    const hidden = hard.getByLabelText('模组 HD，点击查看说明');
    expect(hidden.props.accessibilityHint).toBe('gesture-handler');
    await fireEvent.press(hidden);
    expect(mockShowActionNotification).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Hidden (HD) · 隐藏',
      message: '移除缩圈并让物件在命中前提前消失。',
      variant: 'info',
    }));
  });

  it('scoreId 精确显示已知成绩，找不到时回退同谱面最高分', async () => {
    mockRecentScores = [hardScore, {
      ...hardScore,
      id: 987654321,
      score: 765432,
      accuracy: 0.9123,
      mods: ['HR'],
    }];
    const exact = await render(
      <OsuSongDetail beatmapsetId="3720" initialBeatmapId={22423} initialScoreId={987654321} />,
    );
    const exactHard = within(exact.getByTestId('osu-detail-difficulty-22423'));
    expect(exactHard.getByText('765,432')).toBeTruthy();
    expect(exactHard.getByText('91.23%')).toBeTruthy();
    expect(exactHard.getByTestId('osu-mod-badge-HR')).toBeTruthy();
    await exact.unmount();

    const fallback = await render(
      <OsuSongDetail beatmapsetId="3720" initialBeatmapId={22423} initialScoreId={1} />,
    );
    const fallbackHard = within(fallback.getByTestId('osu-detail-difficulty-22423'));
    expect(fallbackHard.getByText('985,754')).toBeTruthy();
    expect(fallbackHard.getByTestId('osu-mod-badge-HD')).toBeTruthy();
  });

  it('beatmapset 不存在（404 → no_data）渲染找不到这首歌曲', async () => {
    mockDetailState = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new ProviderError('no_data', '未找到该谱面集', false),
    };
    const screen = await render(<OsuSongDetail beatmapsetId="3720" />);
    expect(screen.getByText('找不到这首歌曲')).toBeTruthy();
    expect(screen.queryByTestId('osu-detail-difficulty-22423')).toBeNull();
  });

  it('无数据无错误（如未绑定）同样落入空态', async () => {
    mockDetailState = { data: undefined, isLoading: false, isError: false, error: null };
    const screen = await render(<OsuSongDetail beatmapsetId="3720" />);
    expect(screen.getByText('找不到这首歌曲')).toBeTruthy();
  });

  it('当前模式无难度时轮播显示暂无可用难度', async () => {
    mockDetailState = {
      data: { ...detail, beatmaps: [] },
      isLoading: false,
      isError: false,
      error: null,
    };
    const screen = await render(<OsuSongDetail beatmapsetId="3720" />);
    expect(screen.getByText('暂无可用难度')).toBeTruthy();
  });

  it('iOS：滚动区 TagEditor 按钮走 gesture-handler 按压体系', async () => {
    const screen = await render(<OsuSongDetail beatmapsetId="3720" />);
    const addButtons = screen.getAllByLabelText('添加标签');
    expect(addButtons.length).toBe(4);
    for (const button of addButtons) {
      expect(button.props.testID).toBe('gesture-handler-pressable');
    }
    expect(screen.getAllByTestId('gesture-handler-pressable').length)
      .toBeGreaterThanOrEqual(addButtons.length);
  });

  it('谱面确认位于练习与下载之间，下载保留原有三项选择', async () => {
    const screen = await render(<OsuSongDetail beatmapsetId="3720" />);
    const card = within(screen.getByTestId('osu-detail-difficulty-22423'));
    const judgement = card.getByLabelText('osu 判定统计');
    const achievedAt = card.getByText('达成时间：2026-01-01');
    const practice = card.getByTestId('osu-detail-practice-22423');
    const preview = card.getByTestId('osu-detail-preview-22423');
    const download = card.getByTestId('osu-detail-download-22423');
    const tagEditor = card.getByTestId('osu-detail-chart-tags-22423');
    const children = screen.getByTestId('osu-detail-difficulty-22423').children;

    expect(children.indexOf(judgement)).toBeLessThan(children.indexOf(achievedAt));
    expect(children.indexOf(achievedAt)).toBeLessThan(children.indexOf(practice));
    expect(children.indexOf(practice)).toBeLessThan(children.indexOf(preview));
    expect(children.indexOf(preview)).toBeLessThan(children.indexOf(download));
    expect(children.indexOf(download)).toBeLessThan(children.indexOf(tagEditor));
    expect(practice.props.testID).toBe('osu-detail-practice-22423');
    expect(practice.props.accessibilityHint).toBe('gesture-handler');
    expect(preview.props.accessibilityHint).toBe('gesture-handler');
    expect(download.props.accessibilityHint).toBe('gesture-handler');
    expect(download.props.accessibilityLabel).toBe('下载谱面文件：鳥の詩');

    await fireEvent.press(preview);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/songs/osu-chart-preview',
      params: { gameId: 'osu-standard', beatmapsetId: '3720', beatmapId: '22423', title: '鳥の詩', star: '5.5', difficultyName: 'Hard' },
    });

    await fireEvent.press(download);
    expect(mockShowActionNotification).toHaveBeenCalledWith({
      title: '下载谱面文件',
      message: '谱面文件由 Sayobot 提供。背景视频会增加文件大小和流量消耗，请选择下载内容。',
      variant: 'info',
      actions: [
        expect.objectContaining({ label: '包含背景视频' }),
        expect.objectContaining({ label: '仅游玩内容' }),
        { label: '取消', tone: 'cancel' },
      ],
    });
    const selection = mockShowActionNotification.mock.calls.at(-1)?.[0] as {
      actions: { onPress?: () => void }[];
    };
    selection.actions[0].onPress?.();
    await waitFor(() => expect(mockDownloadOsuBeatmapsetPackage).toHaveBeenCalledWith({
      beatmapsetId: 3720,
      title: '鳥の詩',
      includeVideo: true,
    }, {}));
    selection.actions[1].onPress?.();
    await waitFor(() => expect(mockDownloadOsuBeatmapsetPackage).toHaveBeenLastCalledWith({
      beatmapsetId: 3720,
      title: '鳥の詩',
      includeVideo: false,
    }, {}));

    await fireEvent.press(practice);
    expect(mockSetChartPractice).toHaveBeenCalledWith('3720', 'SD', 22423, true);
  });

  it.each(['osu-standard', 'osu-mania', 'osu-catch', 'osu-taiko'])(
    '%s 谱面确认保留当前模式及当前难度 ID', async (gameId) => {
      mockActiveGameId = gameId;
      const screen = await render(<OsuSongDetail beatmapsetId="3720" />);
      await fireEvent.press(screen.getByTestId('osu-detail-preview-22427'));
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/songs/osu-chart-preview',
        params: { gameId, beatmapsetId: '3720', beatmapId: '22427', title: '鳥の詩', star: '4.3', difficultyName: 'Normal' },
      });
    },
  );

  it('四模式指标数组遵循各自字段集合，缺失值统一为破折号', () => {
    const beatmap = detail.beatmaps[1];
    const standard = buildOsuBeatmapMetricRows('osu-standard', beatmap);
    const catchRows = buildOsuBeatmapMetricRows('osu-catch', beatmap);
    const taiko = buildOsuBeatmapMetricRows('osu-taiko', beatmap);
    const mania = buildOsuBeatmapMetricRows('osu-mania', beatmap);

    expect(standard.map((row) => row.map((metric) => metric.label))).toEqual([
      ['时长', 'BPM', '圆圈总数', '滑条总数'],
      ['圆圈大小', '掉血速度', '准度要求', '缩圈速度'],
    ]);
    expect(catchRows.map((row) => row.map((metric) => metric.label))).toEqual(
      standard.map((row) => row.map((metric) => metric.label)),
    );
    expect(taiko.map((row) => row.map((metric) => metric.label))).toEqual([
      ['时长', 'BPM', '圆圈总数'],
      ['掉血速度', '准度要求'],
    ]);
    expect(mania.map((row) => row.map((metric) => metric.label))).toEqual([
      ['时长', 'BPM', '圆圈总数', '滑条总数'],
      ['按键数量', '掉血速度', '准度要求'],
    ]);
    expect(buildOsuBeatmapMetricRows('osu-standard', {
      ...beatmap,
      totalLength: null,
      bpm: null,
      countCircles: null,
      countSliders: null,
      cs: null,
      drain: null,
      accuracy: null,
      ar: null,
    }).flat().every((metric) => metric.value === '—')).toBe(true);
  });

  it('已加入的谱面显示移出状态，并按原参数移除', async () => {
    mockLibraryItems = [{
      kind: 'chart',
      key: 'chart:osu:3720:SD:22423',
      gameId: 'osu-standard',
      songId: '3720',
      type: 'SD',
      levelIndex: 22423,
      practice: true,
      tags: [],
      createdAt: '2026-08-20T00:00:00.000Z',
      updatedAt: '2026-08-20T00:00:00.000Z',
    }];
    const screen = await render(<OsuSongDetail beatmapsetId="3720" />);
    const button = screen.getByLabelText('移出练习清单');

    fireEvent.press(button);
    expect(mockSetChartPractice).toHaveBeenCalledWith('3720', 'SD', 22423, false);
  });

  it('Android：滚动区 TagEditor 按钮走原生 Pressable（无 gesture-handler 按压）', async () => {
    const originalOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    try {
      const screen = await render(<OsuSongDetail beatmapsetId="3720" />);
      expect(screen.queryAllByTestId('gesture-handler-pressable')).toHaveLength(0);
      const addButtons = screen.getAllByLabelText('添加标签');
      expect(addButtons.length).toBe(4);
      for (const button of addButtons) {
        expect(button.props.testID).not.toBe('gesture-handler-pressable');
      }
      expect(screen.getByTestId('osu-detail-practice-22423').props.accessibilityHint).toBeUndefined();
      expect(screen.getByTestId('osu-detail-preview-22423').props.accessibilityHint).toBeUndefined();
      expect(screen.getByTestId('osu-detail-download-22423').props.accessibilityHint).toBeUndefined();
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS });
    }
  });
});

describe('osu! 详情入口解锁', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('OsuSongRow 可按压，点击进入 /songs/{beatmapset id}', async () => {
    const screen = await render(
      <OsuSongRow gameId="osu-standard" song={{
        beatmapSetId: 3720,
        title: '鳥の詩',
        artist: 'Lia',
        creator: 'James',
        listCover: null,
        difficultyRatings: [2.1, 5.5],
      }} />,
    );
    const row = screen.getByLabelText('歌曲 鳥の詩');
    expect(row.props.accessibilityRole).toBe('button');
    await fireEvent.press(row);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/songs/[songId]', params: { songId: '3720', gameId: 'osu-standard' } });
  });

  it('OsuScoreCard 可按压，点击进入歌曲详情并定位该成绩的 beatmap', async () => {
    const screen = await render(<OsuScoreCard gameId="osu-standard" score={hardScore} />);
    const card = screen.getByTestId('osu-score-card-166715063');
    expect(card.props.accessibilityRole).toBe('button');
    await fireEvent.press(card);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/songs/[songId]',
      params: { songId: '3720', beatmapId: '22423', gameId: 'osu-standard' },
    });
  });
});
