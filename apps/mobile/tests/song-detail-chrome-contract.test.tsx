import { createHash } from 'node:crypto';
import { Animated, InteractionManager } from 'react-native';
import { render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import SongDetailScreen from '../app/songs/[songId]';
import { ChunithmSongDetail } from '@/components/chunithm/ChunithmSongDetail';
import { TufLevelDetailScreen } from '@/screens/TufScreens';
import { MuseDashSongDetailScreen } from '@/screens/MuseDashScreens';
import type { TufLevel } from '@/domain/tuf';
import type { MuseDashAlbumsResponse, MuseDashCeResponse, MuseDashPlayer } from '@/domain/muse-dash';

jest.spyOn(Animated, 'loop').mockReturnValue({
  start: jest.fn(),
  stop: jest.fn(),
  reset: jest.fn(),
} as unknown as ReturnType<typeof Animated.loop>);
jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((callback) => {
  (callback as () => void)();
  return { cancel: jest.fn() } as unknown as ReturnType<typeof InteractionManager.runAfterInteractions>;
});

let mockRouteParams: { songId: string; levelIndex?: string } = { songId: '1' };
let mockActiveGameId: 'maimai' | 'phigros' | 'chunithm' = 'maimai';
let mockGameDataPayload: Record<string, unknown> | null = null;
let mockChunithmCatalog: Record<string, unknown> | null = null;
let mockChunithmDetailSong: Record<string, unknown> | null = null;
let mockPhigrosSongs: Record<string, unknown>[] = [];
let mockTufLevelDetail: TufLevel | undefined;
let mockMuseDashPlayer: MuseDashPlayer | undefined;
let mockMuseDashAlbums: MuseDashAlbumsResponse | undefined;
let mockMuseDashCe: MuseDashCeResponse | undefined;
const mockDiffdiff = [
  ['0-47', 3, '11', 640.1, 11.5],
] as [string, number, string, number, number][];

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useNavigation: () => ({ canGoBack: () => true, goBack: jest.fn() }),
  useLocalSearchParams: () => mockRouteParams,
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('react-native-gesture-handler', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    GestureHandlerRootView: RN.View,
    Pressable: RN.Pressable,
    ScrollView: RN.ScrollView,
  };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, right: 0, bottom: 34, left: 0 }),
}));
jest.mock('@/components/AppNotification', () => ({
  NotificationOutlet: () => null,
  useNotification: () => ({ showNotification: jest.fn(), showActionNotification: jest.fn() }),
  useNotificationModalRequestClose: () => () => false,
}));
jest.mock('@/theme/app-theme', () => ({ useAppTheme: () => ({
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
}) }));
jest.mock('@/state/session-store', () => ({
  useSession: (selector: (state: { activeGameId: string; activeAccountId: string }) => unknown) => selector({
    activeGameId: mockActiveGameId,
    activeAccountId: 'contract-account',
  }),
}));
jest.mock('@/hooks/use-game-data', () => ({
  useGameData: () => ({ data: { payload: mockGameDataPayload } }),
}));
jest.mock('@/hooks/use-detailed-catalog', () => ({
  useDetailedCatalog: () => ({
    data: jest.requireActual<typeof import('../src/fixtures/sanitized')>('../src/fixtures/sanitized').fixtureCatalog,
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  }),
}));
jest.mock('@/hooks/use-dxrating-chart-tags', () => ({
  useDxRatingChartTags: () => ({ data: undefined, isLoading: false, isError: false, error: null }),
}));
jest.mock('@/hooks/use-score-snapshot', () => ({
  useScoreSnapshot: () => ({
    data: { records: [], source: { kind: 'fixture', label: 'fixture', updatedAt: new Date(0).toISOString(), isStale: false } },
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  }),
}));
jest.mock('@/hooks/use-collections', () => ({ useCollections: () => ({
  data: { items: [], source: { kind: 'fixture', label: 'fixture', updatedAt: new Date(0).toISOString(), isStale: false } },
  isLoading: false,
  isError: false,
  error: null,
  refetch: jest.fn(),
}) }));
jest.mock('@/hooks/use-chunithm-catalog', () => ({
  useChunithmCatalog: () => ({
    data: mockChunithmCatalog,
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  }),
}));
jest.mock('@/hooks/use-chunithm-song-detail', () => ({
  useChunithmSongDetail: () => ({
    data: { song: mockChunithmDetailSong, source: { kind: 'fixture', label: 'fixture', updatedAt: new Date(0).toISOString(), isStale: false } },
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  }),
}));
jest.mock('@/hooks/use-phigros-catalog', () => ({
  usePhigrosCatalog: () => ({
    data: {
      snapshot: { songs: mockPhigrosSongs, source: { kind: 'fixture', label: 'fixture', updatedAt: new Date(0).toISOString(), isStale: false } },
      provider: {
        getIllustrationUrl: () => 'https://example.test/i.png',
        getIllustrationBlurUrl: () => 'https://example.test/blur.png',
        getIllustrationLowresUrl: () => 'https://example.test/lowres.png',
      },
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  }),
}));
jest.mock('@/hooks/use-phigros-kyou', () => ({
  usePhigrosKyouChartTags: () => ({ data: undefined, isLoading: false, isError: false, error: null, refetch: jest.fn() }),
}));
jest.mock('@/hooks/use-tuf', () => ({
  useTufLevel: () => ({
    data: mockTufLevelDetail ? { level: mockTufLevelDetail, rerateHistory: [] } : undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  }),
}));
jest.mock('@/hooks/use-muse-dash', () => {
  const query = (data: unknown) => ({
    data,
    source: { kind: 'musedash', label: 'MuseDash.moe', updatedAt: new Date(0).toISOString(), isStale: false },
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: jest.fn(),
  });
  return {
    useMuseDashPlayer: () => query(mockMuseDashPlayer),
    useMuseDashAlbums: () => query(mockMuseDashAlbums),
    useMuseDashCe: () => query(mockMuseDashCe),
    useMuseDashDiffdiff: () => query(mockDiffdiff),
    useMuseDashPlayDetail: () => query(undefined),
    useMuseDashPlayDetails: () => new Map(),
  };
});
jest.mock('@/hooks/use-user-library', () => {
  const { chartLibraryKey, songLibraryKey } = jest.requireActual<typeof import('../src/domain/user-library')>('../src/domain/user-library');
  return {
    useUserLibrary: () => ({
      data: [],
      isLoading: false,
      isUpdating: false,
      setSongFavorite: jest.fn(),
      setChartPractice: jest.fn(),
      setTags: jest.fn(),
      setTagPresets: jest.fn(),
      tagPresets: ['爆发'],
      songKey: (songId: string | number) => songLibraryKey('maimai', songId),
      chartKey: (songId: string | number, type: 'SD' | 'DX', levelIndex: number) => chartLibraryKey('maimai', songId, type, levelIndex),
    }),
  };
});
jest.mock('@/components/TagEditor', () => ({ TagEditor: () => null }));
jest.mock('@/components/SongCover', () => ({ SongCover: () => null }));
jest.mock('@/components/CollectionImage', () => ({ CollectionImage: () => null }));
jest.mock('@/components/CachedTabScreen', () => ({ useCachedTabActive: () => true }));

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)]),
  );
}

async function chromeHash(screen: Awaited<ReturnType<typeof render>>): Promise<string> {
  const back = screen.getByLabelText('返回').toJSON();
  const favorites = screen.queryAllByLabelText(/^(收藏|取消收藏)/).map((node) => node.toJSON());
  const canonical = canonicalize([back, ...favorites]) as unknown[];
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

beforeEach(() => {
  mockActiveGameId = 'maimai';
  mockGameDataPayload = null;
  mockChunithmCatalog = null;
  mockChunithmDetailSong = null;
  mockPhigrosSongs = [];
  mockTufLevelDetail = undefined;
  mockMuseDashPlayer = undefined;
  mockMuseDashAlbums = undefined;
  mockMuseDashCe = undefined;
});

test('maimai song detail chrome contract', async () => {
  const screen = await render(<SongDetailScreen />);
  expect(await chromeHash(screen)).toBe('64cb9da7ba4805538f9b8ee084160e236cae151554784b6c8a51a50a349a7d60');
});

test('chunithm song detail chrome contract', async () => {
  mockActiveGameId = 'chunithm';
  mockRouteParams = { songId: '3' };
  mockChunithmDetailSong = {
    id: 3,
    title: 'B.B.K.K.B.K.K.',
    artist: 'nora2r',
    genre: '其他游戏',
    bpm: 170,
    map: '未来都市',
    rights: 'TEST RIGHTS',
    aliases: ['bbkkbkk', 'bk'],
    versionId: 23000,
    versionTitle: 'CHUNITHM VERSE',
    locked: false,
    disabled: false,
    difficulties: [
      { difficulty: 0, level: '3', levelValue: 3, noteDesigner: 'Basic Designer', versionId: 23000, versionTitle: 'CHUNITHM VERSE' },
      { difficulty: 3, level: '12+', levelValue: 12.5, noteDesigner: 'Master Designer', versionId: 23000, versionTitle: 'CHUNITHM VERSE' },
    ],
  };
  mockChunithmCatalog = {
    currentVersion: { id: 23000, title: 'CHUNITHM VERSE' },
    versions: [{ id: 23000, title: 'CHUNITHM VERSE' }],
    genres: [{ id: 1, title: '其他游戏' }],
    songs: [mockChunithmDetailSong],
    source: { kind: 'lxns', label: 'LXNS 中二节奏公共曲库', updatedAt: '2026-07-28T00:00:00.000Z', isStale: false },
  };
  mockGameDataPayload = {
    kind: 'chunithm',
    scores: [],
    source: { kind: 'lxns', label: '落雪咖啡屋', updatedAt: '2026-07-28T00:00:00.000Z', isStale: false },
    hasSyncedData: true,
  };
  const screen = await render(<ChunithmSongDetail songId="3" />);
  expect(await chromeHash(screen)).toBe('c53ccf89579614e4eb8069a09dc6e369442bc5e2caff9c8c1148136a492a0a9d');
});

test('phigros song detail chrome contract', async () => {
  mockActiveGameId = 'phigros';
  mockRouteParams = { songId: 'Song.A' };
  mockPhigrosSongs = [{
    id: 'Song.A',
    title: '测试曲',
    artist: '测试曲师',
    illustrator: '测试曲绘师',
    version: '3.8.0',
    aliases: ['测试别名一'],
    charts: [
      { songId: 'Song.A', type: 'SD', levelIndex: 2, level: 'IN', difficulty: 'expert', difficultyConstant: 14.8, charter: 'IN谱师', notes: { tap: 100, hold: 110, drag: 120, flick: 130, total: 460 } },
    ],
  }];
  mockGameDataPayload = {
    kind: 'phigros',
    records: [],
    source: { kind: 'generated', label: 'TapTap云存档', updatedAt: '2026-07-20T01:00:00.000Z', isStale: false },
  };
  const screen = await render(<SongDetailScreen />);
  expect(await chromeHash(screen)).toBe('8c5aca6558ef5b7ff5ca294886d9183481ca6ce62927485f5974b1936acff055');
});

test('tuf level detail chrome contract', async () => {
  mockTufLevelDetail = {
    id: 11372, songId: 401, song: '关卡 A', artist: '艺术家', diffId: 8, baseScore: 12.34,
    bpm: null, tilecount: null, autoTileCount: null, levelLengthInMs: null,
    difficulty: { id: 8, name: 'G12', type: 'SPECIAL', sortOrder: 12, baseScore: 12.34 },
    levelCredits: [], tags: [], curations: [],
  } as TufLevel;
  const screen = await render(<TufLevelDetailScreen levelId="11372" />);
  expect(await chromeHash(screen)).toBe('2e0dce77556169d0cb4ef3f1ccd8b0ece53fa48eb1f8e9efe426fd8e49fc9383');
});

test('musedash song detail chrome contract', async () => {
  mockMuseDashAlbums = {
    ALBUM1: {
      title: 'Default Music', json: 'ALBUM1', tag: 'Default',
      music: {
        '0-47': {
          uid: '0-47', name: 'Sample Song', author: 'Sample Author', cover: 'sample_cover',
          bpm: '128', levelDesigner: ['Mapper A'], difficulty: ['2', '5', '8', '11', '12'],
          ChineseS: { name: '示例歌曲', author: '示例作者' },
        },
      },
    },
  };
  mockMuseDashCe = { c: { ChineseS: ['凛'], English: [] }, e: { ChineseS: ['喵斯'], English: [] } };
  mockMuseDashPlayer = {
    lastUpdate: 1786311369798, rl: 3.45, diffHistoryNumber: 11,
    plays: [
      { score: 302027, acc: 94.17, i: 1950, platform: 'mobile', history: { lastRank: 1949 }, difficulty: 3, uid: '0-47', sum: 3950, character_uid: '11', elfin_uid: '7' },
    ],
    user: { user_id: '6ea4f986ffd211e8aa980242ac110011', nickname: 'SiMOOOOOON' },
  };
  const screen = await render(<MuseDashSongDetailScreen songId="0-47" />);
  expect(await chromeHash(screen)).toBe('58a06119d0a89fa83bb7ae70797a98da55fcac4264c028d38fceec6529aa1ae1');
});
