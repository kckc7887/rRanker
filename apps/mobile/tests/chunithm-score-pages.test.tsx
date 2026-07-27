import { Animated } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { Best50Screen } from '../app/(tabs)/b50';
import { RecordsScreen } from '../app/(tabs)/records';
import { CHUNITHM_WORLDS_END_GRADIENT } from '@/components/chunithm/ChunithmDifficultyBadge';

const mockRefetchGame = jest.fn(async () => undefined);
const mockRefetchCatalog = jest.fn(async () => undefined);
const mockPush = jest.fn();

jest.spyOn(Animated, 'loop').mockReturnValue({
  start: jest.fn(), stop: jest.fn(), reset: jest.fn(),
} as unknown as ReturnType<typeof Animated.loop>);

jest.mock('@/components/CachedTabScreen', () => ({
  CachedTabScreen: ({ children }: { children: unknown }) => children,
  useCachedTabActive: () => true,
}));
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));
jest.mock('@/hooks/use-native-tab-bottom-inset', () => ({ useNativeTabBottomInset: () => 0 }));
jest.mock('@/hooks/use-debounced-value', () => ({ useDebouncedValue: (value: string) => value }));
jest.mock('@/hooks/use-score-snapshot', () => ({
  useScoreSnapshot: () => ({ data: undefined, isLoading: false, isError: false, error: null }),
}));
jest.mock('@/hooks/use-detailed-catalog', () => ({
  useDetailedCatalog: () => ({ data: undefined, isLoading: false, isError: false, error: null }),
}));
jest.mock('@/hooks/use-phigros-catalog', () => ({
  usePhigrosCatalog: () => ({ data: undefined, isLoading: false, isError: false, error: null }),
}));
jest.mock('@/state/session-store', () => ({
  useSession: (selector: (state: unknown) => unknown) => selector({
    activeGameId: 'chunithm',
    activeProviderId: 'lxns',
    session: { mode: 'lxns-oauth' },
  }),
}));

const mockSource = {
  kind: 'lxns',
  label: '落雪咖啡屋',
  updatedAt: '2026-07-28T00:00:00.000Z',
  isStale: false,
} as const;

const mockRecords = [
  {
    id: 1,
    song_name: '低 Rating',
    level: '13',
    level_index: 2,
    score: 1_009_000,
    rating: 14,
    clear: 'clear',
    full_combo: 'alljusticecritical',
    full_chain: 'fullchain',
  },
  {
    id: 2,
    song_name: '高 Rating',
    level: '14+',
    level_index: 3,
    score: 1_000_000,
    rating: 16,
    clear: 'absolute',
    full_combo: 'alljustice',
    full_chain: 'fullchain2',
  },
  {
    id: 3,
    song_name: 'WORLD END',
    level: '！',
    level_index: 5,
    score: 1_007_500,
    rating: 15,
    clear: 'hard',
    full_combo: null,
    full_chain: null,
  },
] as const;

jest.mock('@/hooks/use-game-data', () => ({
  useGameData: () => ({
    data: {
      gameId: 'chunithm',
      providerId: 'lxns',
      profile: { ratingLabel: 'RATING' },
      payload: {
        kind: 'chunithm',
        player: { name: '中二玩家' },
        scores: mockRecords,
        bestSections: [
          { id: 'b30', title: 'Best 30', scores: [mockRecords[0], mockRecords[1], mockRecords[2]] },
          { id: 'new20', title: 'New 20', scores: [mockRecords[2]] },
        ],
        playerScore: { label: 'RATING', value: 17.25, display: '17.25' },
        source: mockSource,
        hasSyncedData: true,
      },
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: mockRefetchGame,
  }),
}));
jest.mock('@/hooks/use-chunithm-catalog', () => ({
  useChunithmCatalog: () => ({
    data: {
      currentVersion: { id: 23000, title: 'CHUNITHM VERSE' },
      versions: [{ id: 23000, title: 'CHUNITHM VERSE' }],
      genres: [],
      songs: [
        {
          id: 1,
          title: '第一首歌',
          artist: '目标艺术家',
          genre: 'POPS & ANIME',
          bpm: 180,
          versionId: 23000,
          versionTitle: 'CHUNITHM VERSE',
          locked: false,
          disabled: false,
          difficulties: [{
            difficulty: 2,
            level: '13',
            levelValue: 13.4,
            noteDesigner: '谱师甲',
            versionId: 23000,
            versionTitle: 'CHUNITHM VERSE',
          }],
        },
        {
          id: 2,
          title: '第二首歌',
          artist: '其他艺术家',
          genre: 'POPS & ANIME',
          bpm: 190,
          versionId: 23000,
          versionTitle: 'CHUNITHM VERSE',
          locked: false,
          disabled: false,
          difficulties: [{
            difficulty: 3,
            level: '14+',
            levelValue: 14.8,
            noteDesigner: '谱师乙',
            versionId: 23000,
            versionTitle: 'CHUNITHM VERSE',
          }],
        },
        {
          id: 3,
          title: 'WORLD END 曲目',
          artist: 'WE 艺术家',
          genre: 'WORLD END',
          bpm: 200,
          versionId: 23000,
          versionTitle: 'CHUNITHM VERSE',
          locked: false,
          disabled: false,
          difficulties: [{
            difficulty: 5,
            level: '14',
            levelValue: 14,
            noteDesigner: 'WE 谱师',
            versionId: 23000,
            versionTitle: 'CHUNITHM VERSE',
            originId: 1,
            kanji: '狂',
            star: 4,
          }],
        },
      ],
      source: mockSource,
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: mockRefetchCatalog,
  }),
}));

describe('Chunithm records and B50 screens', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows all scores ordered by Rating, supports local metadata search and has no filter controls', async () => {
    const screen = await render(<RecordsScreen />);
    expect(screen.getByTestId('chunithm-records-list')).toBeTruthy();
    expect(screen.queryByText('筛选')).toBeNull();
    const cards = screen.getAllByTestId(/^chunithm-score-card-/);
    expect(cards.map((card) => card.props.testID)).toEqual([
      'chunithm-score-card-2-3',
      'chunithm-score-card-3-5',
      'chunithm-score-card-1-2',
    ]);
    await fireEvent.press(cards[0]!);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/songs/[songId]',
      params: { songId: '2', levelIndex: '3' },
    });

    await fireEvent.changeText(screen.getByLabelText('中二成绩搜索'), '目标艺术家');
    expect(screen.getByText('第一首歌')).toBeTruthy();
    expect(screen.queryByText('第二首歌')).toBeNull();
  });

  it('renders Best 30 before New 20, resets positions and never renders Selection 10', async () => {
    const screen = await render(<Best50Screen />);
    expect(screen.getByTestId('chunithm-best-results-list')).toBeTruthy();
    expect(screen.getByText('Best 30')).toBeTruthy();
    expect(screen.getByText('New 20')).toBeTruthy();
    expect(screen.queryByText('Selection 10')).toBeNull();
    expect(screen.getByText('1. 第二首歌')).toBeTruthy();
    expect(screen.getByText('1. WORLD END 曲目')).toBeTruthy();
    expect(screen.getByText('2. WORLD END 曲目')).toBeTruthy();
    expect(screen.getByText('3. 第一首歌')).toBeTruthy();
  });

  it('uses fixed primary/achievement rows and the correct static/flowing score styles', async () => {
    const screen = await render(<RecordsScreen />);
    expect(screen.getByTestId('chunithm-primary-tags-1-2')).toBeTruthy();
    expect(screen.getByTestId('chunithm-achievement-tags-1-2')).toBeTruthy();
    expect(screen.getByTestId('flowing-chunithm-score')).toBeTruthy();
    expect(screen.getByTestId('flowing-chunithm-rank')).toBeTruthy();
    expect(screen.getAllByTestId('gradient-chunithm-score')).toHaveLength(2);
    expect(screen.getByText('EXPERT (13.4)')).toBeTruthy();
    expect(screen.getByText("WORLD'S END (狂☆4)")).toBeTruthy();
    expect(screen.queryByText("WORLD'S END (14.0)")).toBeNull();
    expect(screen.getByTestId('chunithm-worlds-end-badge')).toBeTruthy();
    expect(CHUNITHM_WORLDS_END_GRADIENT).toEqual([
      '#37E6FF', '#7B61FF', '#F24FD4', '#FF8A3D',
    ]);
    expect(screen.getByText('SSS+')).toBeTruthy();
    expect(screen.getByTestId('chunithm-full-combo-rainbow')).toBeTruthy();
    expect(screen.getByTestId('chunithm-full-chain-gold')).toBeTruthy();
    expect(screen.getByTestId('chunithm-clear-platinum')).toBeTruthy();
  });
});
