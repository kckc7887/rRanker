import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { SearchScreen } from '../app/(tabs)/search';
import {
  chunithmJacketUrl,
  ChunithmSongRow,
} from '@/components/chunithm/ChunithmSongRow';
import type { ChunithmCatalogSnapshot } from '@/domain/chunithm';

const source = {
  kind: 'lxns' as const,
  label: 'LXNS 中二节奏公共曲库',
  updatedAt: '2026-07-27T12:00:00.000Z',
  isStale: false,
};

const mockCatalog: ChunithmCatalogSnapshot = {
  currentVersion: { id: 23000, title: 'CHUNITHM VERSE' },
  versions: [{ id: 23000, title: 'CHUNITHM VERSE' }],
  genres: [{ id: 1, title: '其他游戏' }],
  source,
  songs: [
    {
      id: 3,
      title: 'B.B.K.K.B.K.K.',
      artist: 'nora2r',
      genre: '其他游戏',
      bpm: 170,
      versionId: 23000,
      versionTitle: 'CHUNITHM VERSE',
      locked: false,
      disabled: false,
      difficulties: [{
        difficulty: 4,
        level: '13+',
        levelValue: 13.7,
        noteDesigner: 'Redarrow',
        versionId: 23000,
        versionTitle: 'CHUNITHM VERSE',
      }],
    },
    {
      id: 123,
      title: 'Only My Railgun',
      artist: 'fripSide',
      genre: 'POPS',
      bpm: 143,
      versionId: 23000,
      versionTitle: 'CHUNITHM VERSE',
      locked: false,
      disabled: false,
      difficulties: [{
        difficulty: 3,
        level: '12',
        levelValue: 12.4,
        noteDesigner: 'Techno Kitchen',
        versionId: 23000,
        versionTitle: 'CHUNITHM VERSE',
      }],
    },
  ],
};

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-image', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Image: ({ source: imageSource, ...props }: { source?: unknown }) => (
      <RN.Image {...props} source={{ uri: String(imageSource) }} />
    ),
  };
});
jest.mock('@/theme/app-theme', () => ({
  useAppTheme: () => ({
    background: '#F7F8FA',
    surface: '#FFFFFF',
    input: '#FFFFFF',
    border: '#D1D5DB',
    text: '#111827',
    textMuted: '#6B7280',
    textSecondary: '#4B5563',
    accent: '#246BFD',
  }),
}));
jest.mock('@/state/session-store', () => ({
  useSession: (selector: (state: { activeGameId: 'chunithm' }) => unknown) => (
    selector({ activeGameId: 'chunithm' })
  ),
}));
jest.mock('@/hooks/use-chunithm-catalog', () => ({
  useChunithmCatalog: () => ({
    data: mockCatalog,
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  }),
}));
jest.mock('@/hooks/use-detailed-catalog', () => ({
  useDetailedCatalog: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  }),
}));
jest.mock('@/hooks/use-user-library', () => ({
  useUserLibrary: () => ({
    data: [],
    isLoading: false,
    isUpdating: false,
    setSongFavorite: jest.fn(),
  }),
}));
jest.mock('@/hooks/use-native-tab-bottom-inset', () => ({
  useNativeTabBottomInset: () => 0,
}));
jest.mock('@/hooks/use-debounced-value', () => ({
  useDebouncedValue: <T,>(value: T) => value,
}));
jest.mock('@/state/catalog-filter', () => ({
  useCatalogFilter: () => ({
    keyword: '',
    collapsed: true,
    type: 'all',
    difficulty: 'all',
    constantMin: '',
    constantMax: '',
    version: 'all',
    versionLocale: 'china',
    setKeyword: jest.fn(),
    setCollapsed: jest.fn(),
    setType: jest.fn(),
    setDifficulty: jest.fn(),
    setConstantMin: jest.fn(),
    setConstantMax: jest.fn(),
    setVersion: jest.fn(),
    setVersionLocale: jest.fn(),
    clearFilters: jest.fn(),
  }),
}));
jest.mock('@/components/MaimaiFilterBar', () => ({
  MaimaiFilterBar: () => {
    const RN = jest.requireActual<typeof import('react-native')>('react-native');
    return <RN.Text>高级筛选器</RN.Text>;
  },
}));

describe('Chunithm catalog screen', () => {
  it('shows a search-only catalog and filters by charter without advanced controls', async () => {
    const screen = await render(<SearchScreen />);

    expect(screen.getByText('共 2 首')).toBeTruthy();
    expect(screen.getByText('B.B.K.K.B.K.K.')).toBeTruthy();
    expect(screen.getByText('Only My Railgun')).toBeTruthy();
    expect(screen.queryByText('高级筛选器')).toBeNull();
    expect(screen.queryAllByRole('button')).toHaveLength(0);

    await fireEvent.changeText(screen.getByLabelText('中二节奏歌曲搜索'), 'Redarrow');

    await waitFor(() => expect(screen.getByText('共 1 首')).toBeTruthy());
    expect(screen.getByText('B.B.K.K.B.K.K.')).toBeTruthy();
    expect(screen.queryByText('Only My Railgun')).toBeNull();
  });

  it("uses WORLD'S END origin id for the jacket and keeps rows non-interactive", async () => {
    const worldsEndSong = {
      ...mockCatalog.songs[0]!,
      id: 99999,
      difficulties: [{
        ...mockCatalog.songs[0]!.difficulties[0]!,
        difficulty: 5 as const,
        originId: 314,
        kanji: '避',
        star: 4,
      }],
    };

    expect(chunithmJacketUrl(worldsEndSong)).toBe(
      'https://assets2.lxns.net/chunithm/jacket/314.png',
    );
    const screen = await render(<ChunithmSongRow song={worldsEndSong} />);
    expect(screen.getByText('WE 避 ★4')).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
