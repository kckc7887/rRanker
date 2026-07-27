import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { StyleSheet } from 'react-native';
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
    expect(screen.getByText('13.7')).toBeTruthy();
    expect(screen.getByText('12.4')).toBeTruthy();
    expect(screen.queryByText(/ULT|MAS/)).toBeNull();
    expect(StyleSheet.flatten(
      screen.getByLabelText('ULTIMA，标级 13+，定数 13.7').props.style,
    )).toEqual(expect.objectContaining({
      backgroundColor: '#17171A',
      borderColor: '#E83A58',
      borderRadius: 999,
    }));
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
    expect(screen.getByText('13.7')).toBeTruthy();
    expect(screen.queryByText('WE 避 ★4')).toBeNull();
    expect(StyleSheet.flatten(
      screen.getByLabelText("WORLD'S END，标级 13+，定数 13.7").props.style,
    )).toEqual(expect.objectContaining({
      backgroundColor: '#1767A6',
      borderRadius: 999,
    }));
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('uses the official five-difficulty color language from the reference image', async () => {
    const paletteSong = {
      ...mockCatalog.songs[0]!,
      difficulties: [
        { ...mockCatalog.songs[0]!.difficulties[0]!, difficulty: 0 as const, level: '3', levelValue: 3 },
        { ...mockCatalog.songs[0]!.difficulties[0]!, difficulty: 1 as const, level: '7', levelValue: 7 },
        { ...mockCatalog.songs[0]!.difficulties[0]!, difficulty: 2 as const, level: '10', levelValue: 10 },
        { ...mockCatalog.songs[0]!.difficulties[0]!, difficulty: 3 as const, level: '12', levelValue: 12 },
        { ...mockCatalog.songs[0]!.difficulties[0]!, difficulty: 4 as const, level: '13+', levelValue: 13.7 },
      ],
    };
    const screen = await render(<ChunithmSongRow song={paletteSong} />);
    const expected = [
      ['BASIC，标级 3，定数 3.0', '#4AA58A', '#4AA58A'],
      ['ADVANCED，标级 7，定数 7.0', '#E27A24', '#E27A24'],
      ['EXPERT，标级 10，定数 10.0', '#D6403A', '#D6403A'],
      ['MASTER，标级 12，定数 12.0', '#7526CF', '#7526CF'],
      ['ULTIMA，标级 13+，定数 13.7', '#17171A', '#E83A58'],
    ] as const;

    for (const [label, backgroundColor, borderColor] of expected) {
      expect(StyleSheet.flatten(screen.getByLabelText(label).props.style)).toEqual(
        expect.objectContaining({ backgroundColor, borderColor, borderRadius: 999 }),
      );
    }
  });
});
