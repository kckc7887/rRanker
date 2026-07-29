import { Animated } from 'react-native';
import { fireEvent, render } from './render-with-query';
import { jest } from '@jest/globals';
import { Best50Screen } from '../app/(tabs)/b50';
import { RecordsScreen } from '../app/(tabs)/records';
import { getGameManifest } from '@/domain/game-manifests';
import { useGameFilters } from '@/state/game-filters';

const mockRefetchGame = jest.fn(async () => undefined);
const mockRefetchCatalog = jest.fn(async () => undefined);
const mockPush = jest.fn();
const mockSessionState = {
  activeGameId: 'chunithm',
  activeProviderId: 'lxns',
  session: { mode: 'lxns-oauth' } as { mode: string } | null,
};

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
  useSession: (selector: (state: unknown) => unknown) => selector(mockSessionState),
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
  beforeEach(() => {
    jest.clearAllMocks();
    useGameFilters.getState().reset();
    mockSessionState.activeProviderId = 'lxns';
    mockSessionState.session = { mode: 'lxns-oauth' };
  });

  it('allows the generated sample provider to open records without LXNS credentials', async () => {
    mockSessionState.activeProviderId = 'chunithm-test';
    mockSessionState.session = null;

    const records = await render(<RecordsScreen />);
    expect(records.getByTestId('game-records-results-list')).toBeTruthy();
    expect(records.queryByText('尚未绑定落雪账号')).toBeNull();
  });

  it('allows the generated sample provider to open the best page without LXNS credentials', async () => {
    mockSessionState.activeProviderId = 'chunithm-test';
    mockSessionState.session = null;

    const best = await render(<Best50Screen />);
    expect(best.getByTestId('game-best-results-list')).toBeTruthy();
    expect(best.queryByText('尚未绑定落雪账号')).toBeNull();
  });

  it('shows all scores ordered by Rating and supports shared metadata search', async () => {
    const screen = await render(<RecordsScreen />);
    expect(screen.getByTestId('game-records-results-list')).toBeTruthy();
    expect(screen.getByText('筛选')).toBeTruthy();
    const cards = screen.getAllByTestId(/^game-score-card-/);
    expect(cards.map((card) => card.props.testID)).toEqual([
      'game-score-card-2-3',
      'game-score-card-3-5',
      'game-score-card-1-2',
    ]);
    await fireEvent.press(cards[0]!);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/songs/[songId]',
      params: { songId: '2', chartId: 'chunithm:2:default:3' },
    });

    await fireEvent.changeText(screen.getByLabelText('成绩搜索'), '目标艺术家');
    expect(screen.getByText('第一首歌')).toBeTruthy();
    expect(screen.queryByText('第二首歌')).toBeNull();
  });

  it('renders Best 30 before New 20, resets positions and never renders Selection 10', async () => {
    const screen = await render(<Best50Screen />);
    expect(screen.getByTestId('game-best-results-list')).toBeTruthy();
    expect(screen.getByText('Best 30')).toBeTruthy();
    expect(screen.getByText('New 20')).toBeTruthy();
    expect(screen.queryByText('Selection 10')).toBeNull();
    expect(screen.getByText('1. 第二首歌')).toBeTruthy();
    expect(screen.getByText('1. WORLD END 曲目')).toBeTruthy();
    expect(screen.getByText('2. WORLD END 曲目')).toBeTruthy();
    expect(screen.getByText('3. 第一首歌')).toBeTruthy();
  });

  it('uses fixed primary/achievement rows and JSON flowing score styles', async () => {
    const screen = await render(<RecordsScreen />);
    expect(screen.getByTestId('game-score-primary-1-2')).toBeTruthy();
    expect(screen.getByTestId('game-score-tags-1-2-0')).toBeTruthy();
    expect(screen.getByTestId('game-score-tags-1-2-1')).toBeTruthy();
    expect(screen.getByText('EXPERT(13)')).toBeTruthy();
    expect(screen.getByText("WORLD'S END(！)")).toBeTruthy();
    expect(screen.getByText('评价 SSS+')).toBeTruthy();
    const manifest = getGameManifest('chunithm');
    const scoreStyle = manifest.tagGroups.find((group) => group.id === 'score')
      ?.items.find((item) => item.id === 'flowing')?.style;
    const goldStyle = manifest.tagGroups.find((group) => group.id === 'achievement')
      ?.items.find((item) => item.id === 'gold')?.style;
    expect(scoreStyle?.text.fill).toMatchObject({ kind: 'gradient', animated: true });
    expect(goldStyle?.text.fill).toMatchObject({ kind: 'gradient', animated: true });
  });
});
