import { render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { OsuScoreCard } from '@/components/osu/OsuScoreCard';
import { OsuBestScreen } from '@/screens/OsuScreens';
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

  it('PP 缺失时显示占位符', async () => {
    const screen = await render(<OsuScoreCard gameId="osu-standard" score={{ ...score, pp: null }} />);
    expect(screen.getByText('—')).toBeTruthy();
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

describe('OsuBestScreen 最佳页', () => {
  it('单分区标题 Top 100 并渲染成绩卡', async () => {
    const screen = await render(<OsuBestScreen />);
    expect(screen.getByText('Top 100')).toBeTruthy();
    expect(screen.getByText('1 条成绩')).toBeTruthy();
    expect(screen.getByText('1. Tori no Uta')).toBeTruthy();
  });
});
