import { Text } from 'react-native';
import type { ReactElement } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import type { GameId } from '@/domain/game-bind-options';
import type { ChunithmScoreCardData } from '@/domain/chunithm-score-presentation';
import type { MuseDashRawScore, MuseDashPlay } from '@/domain/muse-dash';
import type { PhiraChart, PhiraQueriedBest } from '@/domain/phira';
import type { RizlineRecord } from '@/domain/rizline';
import type { TufPass } from '@/domain/tuf';
import type { OsuBestScore } from '@/domain/osu';
import { fixtureRecords } from '@/fixtures/sanitized';
import { decodeDetailTarget, type DetailTarget } from '@/domain/detail-target';
import { GameScoreCard } from '@/components/game-content/GameScoreCard';
import { OsuScoreCard } from '@/components/osu/OsuScoreCard';
import {
  presentChunithmScore,
  presentMaimaiScore,
  presentMuseDashScore,
  presentPhigrosScore,
  presentPhiraScore,
  presentRizlineScore,
  presentTufScore,
} from '@/features/game-content/adapters';
import { presentMajdataScore } from '@/features/game-content/adapters/majdata';
import SongDetailScreen from '../app/songs/[songId]';

let mockActiveGameId: GameId = 'maimai';
let mockRouteParams: Record<string, string> = { songId: '1' };
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), replace: jest.fn() },
  useLocalSearchParams: () => mockRouteParams,
  useNavigation: () => ({ canGoBack: () => true, goBack: jest.fn() }),
  useSegments: () => [],
  Stack: { Screen: () => null },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('react-native-gesture-handler', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return { GestureHandlerRootView: RN.View, Pressable: RN.Pressable, ScrollView: RN.ScrollView };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/theme/app-theme', () => ({ useAppTheme: () => ({
  dark: false,
  background: '#F7F8FA', surface: '#FFF', surfaceMuted: '#EEF2F7', border: '#DDD', text: '#111',
  textSecondary: '#4B5563', textMuted: '#666', accent: '#246BFD', accentSoft: '#E8F0FF',
  input: '#FFF', danger: '#B42318',
}) }));
jest.mock('@/state/session-store', () => ({
  UNBOUND_ACCOUNT_ID: 'maimai:unbound',
  useSession: (selector: (state: { activeGameId: GameId; activeAccountId: string }) => unknown) => selector({
    activeGameId: mockActiveGameId,
    activeAccountId: 'detail-target-account',
  }),
}));
jest.mock('@/hooks/use-detailed-catalog', () => ({
  useDetailedCatalog: () => ({ data: undefined, isLoading: false, isError: false, error: null, refetch: jest.fn() }),
  useMaimaiSongDetail: () => ({ data: undefined, isLoading: false, isError: false, error: null, refetch: jest.fn() }),
}));
jest.mock('@/components/AppNotification', () => ({
  NotificationOutlet: () => null,
  useNotification: () => ({ showNotification: jest.fn(), showActionNotification: jest.fn() }),
  useNotificationModalRequestClose: () => () => false,
}));

/** 游戏详情页替身：把收到的 props 原样渲染出来，供路由断言定位结果。 */
function mockDetailEcho(testID: string) {
  const React = jest.requireActual<typeof import('react')>('react');
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  function DetailEcho(props: Record<string, unknown>) {
    return React.createElement(RN.Text, { testID }, JSON.stringify(props));
  }
  return DetailEcho;
}

jest.mock('@/components/phigros/PhigrosSongDetail', () => ({
  PhigrosSongDetail: mockDetailEcho('phigros-detail'),
}));
jest.mock('@/components/majdata/MajdataSongDetail', () => ({
  MajdataSongDetail: mockDetailEcho('majdata-detail'),
}));
jest.mock('@/components/rizline/RizlineSongDetail', () => ({
  RizlineSongDetail: mockDetailEcho('rizline-detail'),
}));
jest.mock('@/components/chunithm/ChunithmSongDetail', () => ({
  ChunithmSongDetail: mockDetailEcho('chunithm-detail'),
}));
jest.mock('@/components/osu/OsuSongDetail', () => ({
  OsuSongDetail: mockDetailEcho('osu-detail'),
}));
jest.mock('@/screens/PhiraScreens', () => ({
  PhiraSongDetailScreen: mockDetailEcho('phira-detail'),
  PhiraBestScreen: () => null,
  PhiraRecordsScreen: () => null,
  PhiraCatalogScreen: () => null,
}));
jest.mock('@/screens/TufScreens', () => ({
  TufLevelDetailScreen: mockDetailEcho('adofai-detail'),
  TufBestScreen: () => null,
  TufRecordsScreen: () => null,
  TufSearchScreen: () => null,
}));
jest.mock('@/screens/MuseDashScreens', () => ({
  MuseDashSongDetailScreen: mockDetailEcho('musedash-detail'),
  MuseDashBestScreen: () => null,
  MuseDashRecordsScreen: () => null,
  MuseDashCatalogScreen: () => null,
}));

function phiraChart(id: number): PhiraChart {
  return {
    id,
    name: `Phira 测试谱面 #${id}`,
    level: 'IN Lv.16',
    difficulty: 16,
    charter: '测试谱师',
    composer: '测试曲师',
    illustrator: null,
    description: null,
    ranked: false,
    stable: false,
    illustration: null,
    preview: null,
    file: `https://assets.example/${id}/chart.zip`,
    uploader: 1,
    tags: [],
    rating: null,
    ratingCount: 0,
    created: null,
    updated: null,
    chartUpdated: null,
  };
}

const maimaiRecord = {
  songId: '152', title: 'B15高', type: 'DX' as const, difficulty: 'remaster' as const,
  difficultyConstant: 14.8, levelIndex: 4, achievements: 99.9999, rating: 400, rate: 'sss',
};

const phigrosRecord = {
  ...fixtureRecords[0]!, songId: 'Song.A', title: '测试曲', levelIndex: 3,
  difficulty: 'expert' as const, difficultyConstant: 14.8, achievements: 99.5, dxScore: 900000,
};

const chunithmCard: ChunithmScoreCardData = {
  key: '3:3', songId: '3', title: '第三首歌', levelIndex: 3, level: '13',
  difficultyConstant: 13.2, score: 1_008_000, rank: 'SSS+', clear: 'clear',
};

const rizlineRecord: RizlineRecord = {
  chartId: 'song.a.IN', songId: 'song.a', difficulty: 'IN', levelIndex: 2,
  title: 'Rizline 测试曲', achievements: 101.5, score: 1_000_000, rks: 14.5, ap: false, ahStatus: 'unknown',
};

const museDashRaw: MuseDashRawScore = {
  play: { uid: '0-47', difficulty: 3, acc: 94.17, sum: 3950 } as MuseDashPlay,
  song: null,
  albumTitle: 'Default Music',
  characterName: null,
  elfinName: null,
};

const tufPass = {
  id: 9, levelId: 11372, scoreV2: 98.5, accuracy: 0.995, speed: 1.2, impact: 12.5,
  level: { song: '关卡 A', baseScore: 12.34 },
} as unknown as TufPass;

const phiraBest: PhiraQueriedBest = {
  chart: phiraChart(19365), record: null, poolRks: null, queriedAt: new Date(0).toISOString(),
};

const osuScore: OsuBestScore = {
  id: 166715063,
  score: 985754,
  accuracy: 0.9852,
  maxCombo: 450,
  pp: 72.9787,
  rank: 'X',
  beatmap: { id: 22423, beatmapSetId: 3720, difficultyRating: 7.34, version: 'Insane' },
  beatmapset: { id: 3720, title: 'Tori no Uta', artist: 'Lix', creator: 'James', listCover: null },
  statistics: null,
  mods: [],
  achievedAt: null,
};

function sharedCard(presentation: Parameters<typeof GameScoreCard>[0]['presentation'], testID: string): ReactElement {
  return (
    <GameScoreCard presentation={presentation} testID={testID}
      cardStyle={{}} mainStyle={{}} titleStyle={{}} side={<></>}>
      <Text>{presentation.title}</Text>
    </GameScoreCard>
  );
}

type RoundTripCase = {
  name: string;
  game: GameId;
  card: ReactElement;
  cardTestID: string;
  detailTestID: string;
  target: DetailTarget;
  detailProps: Record<string, unknown>;
};

const CASES: RoundTripCase[] = [
  {
    name: '舞萌',
    game: 'maimai',
    card: sharedCard(presentMaimaiScore(maimaiRecord), 'maimai-score-card'),
    cardTestID: 'maimai-score-card',
    detailTestID: '',
    target: { game: 'maimai', songId: '152', chartType: 'DX', levelIndex: 4 },
    detailProps: {},
  },
  {
    name: 'Phigros',
    game: 'phigros',
    card: sharedCard(presentPhigrosScore(phigrosRecord), 'phigros-score-card'),
    cardTestID: 'phigros-score-card',
    detailTestID: 'phigros-detail',
    target: { game: 'phigros', songId: 'Song.A', levelIndex: 3 },
    detailProps: { songId: 'Song.A', levelIndex: 3 },
  },
  {
    name: '中二节奏',
    game: 'chunithm',
    card: sharedCard(presentChunithmScore(chunithmCard), 'chunithm-score-card'),
    cardTestID: 'chunithm-score-card',
    detailTestID: 'chunithm-detail',
    target: { game: 'chunithm', songId: '3', levelIndex: 3 },
    detailProps: { songId: '3', initialLevelIndex: 3 },
  },
  {
    name: 'Rizline',
    game: 'rizline',
    card: sharedCard(presentRizlineScore(rizlineRecord), 'rizline-score-card'),
    cardTestID: 'rizline-score-card',
    detailTestID: 'rizline-detail',
    target: { game: 'rizline', songId: 'song.a', levelIndex: 2 },
    detailProps: { songId: 'song.a', initialLevelIndex: 2 },
  },
  {
    name: 'Majdata Net',
    game: 'majdata-net',
    card: sharedCard(presentMajdataScore({
      key: 'uuid-1:5', songId: 'uuid-1', title: 'Majdata 测试曲', level: 5,
      difficulty: 'Master', dx: 101.25, combo: 1500,
    }), 'majdata-score-card'),
    cardTestID: 'majdata-score-card',
    detailTestID: 'majdata-detail',
    target: { game: 'majdata-net', songId: 'uuid-1', levelIndex: 5 },
    detailProps: { songId: 'uuid-1', initialLevelIndex: 5 },
  },
  {
    name: '喵斯快跑',
    game: 'musedash',
    card: sharedCard(presentMuseDashScore(museDashRaw), 'musedash-score-card'),
    cardTestID: 'musedash-score-card',
    detailTestID: 'musedash-detail',
    target: { game: 'musedash', songId: '0-47', levelIndex: 3 },
    detailProps: { songId: '0-47', levelIndex: 3 },
  },
  {
    name: 'Phira',
    game: 'phira',
    card: sharedCard(presentPhiraScore(phiraBest), 'phira-score-card'),
    cardTestID: 'phira-score-card',
    detailTestID: 'phira-detail',
    target: { game: 'phira', chartId: '19365' },
    detailProps: { chartId: '19365' },
  },
  {
    name: '冰与火之舞',
    game: 'adofai',
    card: sharedCard(presentTufScore(tufPass), 'adofai-score-card'),
    cardTestID: 'adofai-score-card',
    detailTestID: 'adofai-detail',
    target: { game: 'adofai', levelId: '11372' },
    detailProps: { levelId: '11372' },
  },
];

function detailProps(screen: Awaited<ReturnType<typeof render>>, testID: string): Record<string, unknown> {
  return JSON.parse(String(screen.getByTestId(testID).props.children)) as Record<string, unknown>;
}

function pushedHref(): { pathname: string; params: Record<string, string> } {
  return mockPush.mock.calls[0]![0] as { pathname: string; params: Record<string, string> };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockActiveGameId = 'maimai';
  mockRouteParams = { songId: '1' };
});

describe('成绩卡 → 详情路由 → 详情定位 往返', () => {
  it.each(CASES)('$name 卡片点击后解出同一谱面的 DetailTarget', async (testCase) => {
    const card = await render(testCase.card);
    await fireEvent.press(card.getByTestId(testCase.cardTestID));
    expect(mockPush).toHaveBeenCalledTimes(1);

    const href = pushedHref();
    expect(href.pathname).toBe('/songs/[songId]');
    expect(decodeDetailTarget(testCase.game, href.params)).toEqual({ ok: true, target: testCase.target });
    await card.unmount();
  });

  it.each(CASES.filter((testCase) => testCase.detailTestID !== ''))(
    '$name 路由把已校验 target 交给对应游戏的详情页',
    async (testCase) => {
      const card = await render(testCase.card);
      await fireEvent.press(card.getByTestId(testCase.cardTestID));
      const href = pushedHref();
      await card.unmount();

      mockActiveGameId = testCase.game;
      mockRouteParams = href.params;
      const route = await render(<SongDetailScreen />);
      expect(detailProps(route, testCase.detailTestID)).toEqual(testCase.detailProps);
      await route.unmount();
    },
  );

  it('osu 的 beatmap id 与难度索引不混淆', async () => {
    const card = await render(<OsuScoreCard gameId="osu-standard" score={osuScore} detailScoreId={osuScore.id} />);
    await fireEvent.press(card.getByTestId(`osu-score-card-${osuScore.id}`));

    const href = pushedHref();
    expect(href.pathname).toBe('/songs/[songId]');
    expect(href.params).toEqual({ songId: '3720', levelIndex: '22423', scoreId: '166715063' });

    const resolution = decodeDetailTarget('osu-standard', href.params);
    expect(resolution).toEqual({
      ok: true,
      target: { game: 'osu-standard', beatmapsetId: '3720', beatmapId: 22423, scoreId: 166715063 },
    });
    expect(Object.keys((resolution as { target: DetailTarget }).target)).not.toContain('levelIndex');

    mockActiveGameId = 'osu-standard';
    mockRouteParams = href.params;
    const route = await render(<SongDetailScreen />);
    expect(detailProps(route, 'osu-detail')).toEqual({
      beatmapsetId: '3720', initialBeatmapId: 22423, initialScoreId: 166715063,
    });
    await card.unmount();
    await route.unmount();
  });

  it('非法或缺失的定位参数显示明确空态且不挂载游戏详情页', async () => {
    mockActiveGameId = 'phigros';
    mockRouteParams = { songId: 'Song.A', levelIndex: 'abc' };
    const route = await render(<SongDetailScreen />);
    expect(route.getByText('无法打开谱面')).toBeTruthy();
    expect(route.queryByTestId('phigros-detail')).toBeNull();
    await route.unmount();

    mockRouteParams = {};
    const missing = await render(<SongDetailScreen />);
    expect(missing.getByText('无法打开谱面')).toBeTruthy();
    expect(missing.queryByTestId('phigros-detail')).toBeNull();
  });
});
