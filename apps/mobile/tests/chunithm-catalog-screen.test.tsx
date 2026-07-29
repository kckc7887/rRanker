import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { SearchScreen } from '../app/(tabs)/search';
import {
  chunithmJacketUrl,
  ChunithmSongRow,
} from '@/components/chunithm/ChunithmSongRow';
import { CHUNITHM_WORLDS_END_GRADIENT } from '@/components/chunithm/ChunithmDifficultyBadge';
import type { ChunithmCatalogSnapshot } from '@/domain/chunithm';
import { useChunithmCatalogFilter } from '@/state/chunithm-catalog-filter';

const source = {
  kind: 'lxns' as const,
  label: 'LXNS 中二节奏公共曲库',
  updatedAt: '2026-07-27T12:00:00.000Z',
  isStale: false,
};

const mockCatalog: ChunithmCatalogSnapshot = {
  currentVersion: { id: 23000, title: 'CHUNITHM VERSE' },
  versions: [
    { id: 22000, title: 'CHUNITHM LUMINOUS PLUS' },
    { id: 23000, title: 'CHUNITHM VERSE' },
  ],
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
      difficulties: [
        {
          difficulty: 3,
          level: '12+',
          levelValue: 12.8,
          noteDesigner: '旧谱师',
          versionId: 22000,
          versionTitle: 'CHUNITHM LUMINOUS PLUS',
        },
        {
          difficulty: 4,
          level: '13+',
          levelValue: 13.7,
          noteDesigner: 'Redarrow',
          versionId: 23000,
          versionTitle: 'CHUNITHM VERSE',
        },
      ],
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
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));
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
  NeutralChip: ({
    label,
    onPress,
  }: {
    label: string;
    onPress: () => void;
  }) => {
    const RN = jest.requireActual<typeof import('react-native')>('react-native');
    return <RN.Pressable onPress={onPress}><RN.Text>{label}</RN.Text></RN.Pressable>;
  },
  FilterChipFrame: ({
    accessibilityLabel,
    children,
    onPress,
  }: {
    accessibilityLabel: string;
    children: React.ReactNode;
    onPress: () => void;
  }) => {
    const RN = jest.requireActual<typeof import('react-native')>('react-native');
    return (
      <RN.Pressable accessibilityLabel={accessibilityLabel} onPress={onPress}>
        {children}
      </RN.Pressable>
    );
  },
}));

describe('Chunithm catalog screen', () => {
  beforeEach(() => {
    useChunithmCatalogFilter.getState().reset();
  });

  it('keeps the existing rows and metadata search with the filter bar collapsed by default', async () => {
    const screen = await render(<SearchScreen />);

    expect(screen.getByText('共 2 首')).toBeTruthy();
    expect(screen.getByText('B.B.K.K.B.K.K.')).toBeTruthy();
    expect(screen.getByText('Only My Railgun')).toBeTruthy();
    expect(screen.getByText('13.7')).toBeTruthy();
    expect(screen.getByText('12.8')).toBeTruthy();
    expect(screen.getByText('12.4')).toBeTruthy();
    expect(screen.queryByText(/ULT|MAS/)).toBeNull();
    expect(StyleSheet.flatten(
      screen.getByLabelText('ULTIMA，标级 13+，定数 13.7').props.style,
    )).toEqual(expect.objectContaining({
      backgroundColor: '#17171A',
      borderColor: '#E83A58',
      borderRadius: 999,
    }));
    expect(screen.getByLabelText('展开中二筛选，当前 全部')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('中二节奏歌曲搜索'), 'Redarrow');

    await waitFor(() => expect(screen.getByText('共 1 首')).toBeTruthy());
    expect(screen.getByText('B.B.K.K.B.K.K.')).toBeTruthy();
    expect(screen.queryByText('Only My Railgun')).toBeNull();
  });

  it('combines difficulty, chart version and constant on one chart and only shows matched badges', async () => {
    const state = useChunithmCatalogFilter.getState();
    state.setDifficulty(3);
    state.setVersion('22000');
    state.setConstantMin('12.5');
    state.setConstantMax('13');

    const screen = await render(<SearchScreen />);

    expect(screen.getByText('共 1 首')).toBeTruthy();
    expect(screen.getByText('B.B.K.K.B.K.K.')).toBeTruthy();
    expect(screen.queryByText('Only My Railgun')).toBeNull();
    expect(screen.getByText('12.8')).toBeTruthy();
    expect(screen.queryByText('13.7')).toBeNull();
    expect(screen.getAllByText(/CHUNITHM LUMINOUS PLUS/).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(
      '展开中二筛选，当前 MASTER · CHUNITHM LUMINOUS PLUS · 定数 12.5~13',
    )).toBeTruthy();
  });

  it('expands the filter and resets search and chart conditions without changing rows', async () => {
    const screen = await render(<SearchScreen />);
    await fireEvent.press(screen.getByLabelText('展开中二筛选，当前 全部'));

    expect(screen.getByLabelText('中二版本筛选，当前 全部')).toBeTruthy();
    expect(screen.getByLabelText('中二最低定数')).toBeTruthy();
    expect(screen.getByLabelText('中二最高定数')).toBeTruthy();

    await act(() => {
      useChunithmCatalogFilter.getState().setDifficulty(4);
      useChunithmCatalogFilter.getState().setKeyword('不存在');
    });
    await waitFor(() => expect(screen.getByText('筛选结果为空')).toBeTruthy());

    await fireEvent.press(screen.getByLabelText('重置中二筛选'));
    expect(screen.getByText('共 2 首')).toBeTruthy();
    expect(screen.getByLabelText('中二节奏歌曲搜索').props.value).toBe('');
  });

  it('uses the standard song id for the jacket and opens the song detail', async () => {
    const song = mockCatalog.songs[0]!;
    expect(chunithmJacketUrl(song)).toBe(
      'https://assets2.lxns.net/chunithm/jacket/3.png',
    );
    const screen = await render(<ChunithmSongRow song={song} />);
    expect(screen.getByText('13.7')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('打开歌曲详情 B.B.K.K.B.K.K.'));
    expect(router.push).toHaveBeenCalledWith('/songs/3');
  });

  it('does not show locked or disabled status labels', async () => {
    const screen = await render(
      <ChunithmSongRow song={{ ...mockCatalog.songs[0]!, locked: true, disabled: true }} />,
    );
    expect(screen.queryByText('需解锁')).toBeNull();
    expect(screen.queryByText('已禁用')).toBeNull();
  });

  it("uses origin_id and attribute stars for WORLD'S END without showing level_value", async () => {
    const song = {
      ...mockCatalog.songs[0]!,
      id: 90001,
      difficulties: [{
        ...mockCatalog.songs[0]!.difficulties[0]!,
        difficulty: 5 as const,
        level: '14',
        levelValue: 14,
        originId: 1234,
        kanji: '狂',
        star: 4,
      }],
    };
    expect(chunithmJacketUrl(song)).toBe(
      'https://assets2.lxns.net/chunithm/jacket/1234.png',
    );
    const screen = await render(<ChunithmSongRow song={song} />);
    expect(screen.getByText('狂☆4')).toBeTruthy();
    expect(screen.queryByText('14.0')).toBeNull();
    expect(screen.getByTestId('chunithm-worlds-end-badge')).toBeTruthy();
    expect(CHUNITHM_WORLDS_END_GRADIENT).toEqual([
      '#37E6FF', '#7B61FF', '#F24FD4', '#FF8A3D',
    ]);
  });

  it('uses the five regular difficulty colors plus the WORLD’S END neon theme', async () => {
    const paletteSong = {
      ...mockCatalog.songs[0]!,
      difficulties: [
        { ...mockCatalog.songs[0]!.difficulties[0]!, difficulty: 0 as const, level: '3', levelValue: 3 },
        { ...mockCatalog.songs[0]!.difficulties[0]!, difficulty: 1 as const, level: '7', levelValue: 7 },
        { ...mockCatalog.songs[0]!.difficulties[0]!, difficulty: 2 as const, level: '10', levelValue: 10 },
        { ...mockCatalog.songs[0]!.difficulties[0]!, difficulty: 3 as const, level: '12', levelValue: 12 },
        { ...mockCatalog.songs[0]!.difficulties[0]!, difficulty: 4 as const, level: '13+', levelValue: 13.7 },
        {
          ...mockCatalog.songs[0]!.difficulties[0]!,
          difficulty: 5 as const,
          level: '14',
          levelValue: 14,
          kanji: '狂',
          star: 4,
        },
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
    expect(screen.getByText('狂☆4')).toBeTruthy();
    expect(screen.getByTestId('chunithm-worlds-end-badge')).toBeTruthy();
  });
});
