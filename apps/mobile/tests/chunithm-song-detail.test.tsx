import { fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { Linking, StyleSheet } from 'react-native';
import { ChunithmSongDetail } from '@/components/chunithm/ChunithmSongDetail';
import type {
  ChunithmCatalogSnapshot,
  ChunithmSongDetailSnapshot,
} from '@/domain/chunithm';

const mockBack = jest.fn();
const mockSetSongFavorite = jest.fn(async () => undefined);
const mockSetChartPractice = jest.fn(async () => undefined);
const mockSetTags = jest.fn(async () => undefined);
const mockSetTagPresets = jest.fn(async () => undefined);
const mockCatalogRefetch = jest.fn(async () => undefined);
const mockDetailRefetch = jest.fn(async () => undefined);

const source = {
  kind: 'lxns' as const,
  label: 'LXNS 中二节奏公共曲库',
  updatedAt: '2026-07-28T00:00:00.000Z',
  isStale: false,
};
const song = {
  id: 3,
  title: 'B.B.K.K.B.K.K.',
  artist: 'nora2r',
  genre: '其他游戏',
  bpm: 170,
  map: '未来都市',
  rights: 'TEST RIGHTS',
  versionId: 23000,
  versionTitle: 'CHUNITHM VERSE',
  locked: false,
  disabled: false,
  difficulties: [
    {
      difficulty: 0 as const,
      level: '3',
      levelValue: 3,
      noteDesigner: 'Basic Designer',
      versionId: 23000,
      versionTitle: 'CHUNITHM VERSE',
      notes: { total: 333, tap: 219, hold: 24, slide: 48, air: 42, flick: 0 },
    },
    {
      difficulty: 3 as const,
      level: '12+',
      levelValue: 12.5,
      noteDesigner: 'Master Designer',
      versionId: 23000,
      versionTitle: 'CHUNITHM VERSE',
      notes: { total: 960, tap: 521, hold: 101, slide: 135, air: 57, flick: 146 },
    },
    {
      difficulty: 4 as const,
      level: '13+',
      levelValue: 13.7,
      noteDesigner: 'Ultima Designer',
      versionId: 23000,
      versionTitle: 'CHUNITHM VERSE',
      notes: { total: 1626, tap: 893, hold: 118, slide: 392, air: 124, flick: 99 },
    },
    {
      difficulty: 5 as const,
      level: '0',
      levelValue: 0,
      noteDesigner: 'WE Designer',
      versionId: 22000,
      versionTitle: 'CHUNITHM LUMINOUS PLUS',
      originId: 163,
      kanji: '止',
      star: 1,
      notes: { total: 1244, tap: 606, hold: 319, slide: 209, air: 110, flick: 0 },
    },
  ],
};
const mockCatalog: ChunithmCatalogSnapshot = {
  currentVersion: { id: 23000, title: 'CHUNITHM VERSE' },
  versions: [{ id: 23000, title: 'CHUNITHM VERSE' }],
  genres: [{ id: 1, title: '其他游戏' }],
  songs: [song],
  source,
};
const mockDetail: ChunithmSongDetailSnapshot = {
  song,
  source: {
    ...source,
    label: 'LXNS 中二节奏单曲详情',
    updatedAt: '2026-07-28T01:00:00.000Z',
  },
};
const mockScores = [{
  id: 3,
  song_name: song.title,
  level: '12+',
  level_index: 3,
  score: 1_009_000,
  rating: 15.25,
  over_power: 98.12,
  clear: 'clear',
  full_combo: 'alljustice',
  full_chain: null,
}] as const;

let mockDetailState: {
  data?: ChunithmSongDetailSnapshot;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
} = {
  data: mockDetail,
  isLoading: false,
  isError: false,
  error: null,
};
let mockCatalogState = mockCatalog;
let mockDarkTheme = false;

jest.mock('expo-router', () => ({
  router: { back: mockBack },
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
jest.mock('@/theme/app-theme', () => ({
  useAppTheme: () => ({
    dark: mockDarkTheme,
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
jest.mock('@/hooks/use-chunithm-catalog', () => ({
  useChunithmCatalog: () => ({
    data: mockCatalogState,
    isLoading: false,
    isError: false,
    error: null,
    refetch: mockCatalogRefetch,
  }),
}));
jest.mock('@/hooks/use-chunithm-song-detail', () => ({
  useChunithmSongDetail: () => ({
    ...mockDetailState,
    refetch: mockDetailRefetch,
  }),
}));
jest.mock('@/hooks/use-game-data', () => ({
  useGameData: () => ({
    data: {
      payload: {
        kind: 'chunithm',
        scores: mockScores,
        source: {
          ...source,
          label: '落雪咖啡屋',
        },
        hasSyncedData: true,
      },
    },
  }),
}));
jest.mock('@/hooks/use-user-library', () => ({
  useUserLibrary: () => ({
    data: [],
    isLoading: false,
    isUpdating: false,
    songKey: (songId: string) => `song:chunithm:${songId}`,
    chartKey: (songId: string, type: string, levelIndex: number) => (
      `chart:chunithm:${songId}:${type}:${levelIndex}`
    ),
    setSongFavorite: mockSetSongFavorite,
    setChartPractice: mockSetChartPractice,
    setTags: mockSetTags,
    tagPresets: ['爆发'],
    setTagPresets: mockSetTagPresets,
  }),
}));
jest.mock('@/components/TagEditor', () => ({
  TagEditor: ({
    tags,
    onChange,
  }: {
    tags: string[];
    onChange: (tags: string[]) => Promise<unknown>;
  }) => {
    const RN = jest.requireActual<typeof import('react-native')>('react-native');
    return (
      <RN.View>
        <RN.Text>谱面标签：{tags.join('、') || '无'}</RN.Text>
        <RN.Pressable accessibilityLabel="添加详情测试标签" onPress={() => void onChange(['爆发'])} />
      </RN.View>
    );
  },
}));

describe('Chunithm song detail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDarkTheme = false;
    mockCatalogState = mockCatalog;
    mockDetailState = {
      data: mockDetail,
      isLoading: false,
      isError: false,
      error: null,
    };
  });

  it('defaults to MASTER and renders score, notes, actions and song tags', async () => {
    const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const screen = await render(<ChunithmSongDetail songId="3" />);

    expect(screen.getByText('#3')).toBeTruthy();
    expect(screen.getByText('B.B.K.K.B.K.K.')).toBeTruthy();
    expect(screen.getAllByText('CHUNITHM VERSE').length).toBeGreaterThan(0);
    expect(screen.getByTestId('chunithm-metadata-value-版本').props.numberOfLines).toBe(2);
    await fireEvent(screen.getByTestId('chunithm-metadata-measure-版本'), 'textLayout', {
      nativeEvent: { lines: [{}, {}, {}] },
    });
    await fireEvent.press(screen.getByLabelText('展开版本'));
    expect(screen.getByTestId('chunithm-metadata-value-版本').props.numberOfLines).toBeUndefined();
    await fireEvent.press(screen.getByLabelText('收起版本'));
    expect(screen.getByTestId('chunithm-metadata-value-版本').props.numberOfLines).toBe(2);
    expect(screen.getByLabelText('中二难度卡片').props.contentOffset.x).toBeGreaterThan(0);

    const master = within(screen.getByTestId('chunithm-detail-difficulty-3'));
    expect(master.getByText('MASTER')).toBeTruthy();
    expect(master.getByText('12+')).toBeTruthy();
    expect(master.getByText('12.5')).toBeTruthy();
    expect(master.queryByText('定数 12.5')).toBeNull();
    expect(master.getByText('Score')).toBeTruthy();
    expect(master.getByLabelText('1,009,000')).toBeTruthy();
    expect(master.getByText('SSS+')).toBeTruthy();
    expect(master.getByText('AJ')).toBeTruthy();
    expect(master.getByText('CLEAR')).toBeTruthy();
    expect(master.getByText('15.25')).toBeTruthy();
    expect(master.getByText('98.12')).toBeTruthy();
    expect(master.getByText('谱师：Master Designer')).toBeTruthy();
    const notes = within(master.getByLabelText('中二谱面物量'));
    for (const label of ['TAP', 'HOLD', 'SLIDE', 'AIR', 'FLICK', '总计']) {
      expect(notes.getByText(label)).toBeTruthy();
    }
    for (const value of ['521', '101', '135', '57', '146', '960']) {
      expect(notes.getByText(value)).toBeTruthy();
    }

    const basic = within(screen.getByTestId('chunithm-detail-difficulty-0'));
    const basicNotes = within(basic.getByLabelText('中二谱面物量'));
    expect(basicNotes.queryByText('FLICK')).toBeNull();
    for (const label of ['TAP', 'HOLD', 'SLIDE', 'AIR', '总计']) {
      expect(basicNotes.getByText(label)).toBeTruthy();
    }
    expect(StyleSheet.flatten(screen.getByTestId('chunithm-detail-difficulty-4').props.style))
      .toMatchObject({
        backgroundColor: '#17171A',
        borderColor: '#E83A58',
      });

    await fireEvent.press(screen.getByLabelText('收藏 B.B.K.K.B.K.K.'));
    expect(mockSetSongFavorite).toHaveBeenCalledWith('3', true);
    await fireEvent.press(master.getByLabelText('加入练习清单'));
    expect(mockSetChartPractice).toHaveBeenCalledWith('3', 'SD', 3, true);
    await fireEvent.press(master.getByLabelText('添加详情测试标签'));
    expect(mockSetTags).toHaveBeenCalledWith({
      kind: 'chart',
      songId: '3',
      type: 'SD',
      levelIndex: 3,
    }, ['爆发']);

    await fireEvent.press(master.getByLabelText(
      '搜索谱面确认：中二节奏 B.B.K.K.B.K.K. MASTER 谱面确认',
    ));
    await waitFor(() => expect(openUrl).toHaveBeenCalledWith(
      `bilibili://search?keyword=${encodeURIComponent('中二节奏 B.B.K.K.B.K.K. MASTER 谱面确认')}`,
    ));
    expect(screen.getByText('版权：TEST RIGHTS')).toBeTruthy();
    expect(screen.queryByLabelText('数据来源状态')).toBeNull();
  });

  it("uses WORLD'S END attributes and never treats level_value as a constant", async () => {
    const screen = await render(<ChunithmSongDetail songId="3" initialLevelIndex={5} />);
    expect(screen.getByLabelText('中二难度卡片').props.contentOffset.x).toBe(0);
    expect(screen.getByLabelText('歌曲封面 B.B.K.K.B.K.K.').props.source.uri)
      .toBe('https://assets2.lxns.net/chunithm/jacket/163.png');
    const worldsEnd = within(screen.getByTestId('chunithm-detail-difficulty-5'));
    expect(screen.getByTestId('chunithm-detail-difficulty-5').props.colors)
      .toEqual(worldsEnd.getByTestId('chunithm-worlds-end-badge').props.colors);
    expect(StyleSheet.flatten(worldsEnd.getByTestId('chunithm-worlds-end-card-overlay').props.style))
      .toMatchObject({ backgroundColor: 'rgba(20,14,38,0.62)' });
    expect(StyleSheet.flatten(worldsEnd.getByText('止☆1').props.style))
      .toMatchObject({ color: '#FFFFFF' });
    expect(StyleSheet.flatten(
      worldsEnd.getByTestId('chunithm-special-tag-surface-5').props.style,
    )).toMatchObject({ backgroundColor: 'rgba(255,255,255,0.94)' });
    expect(worldsEnd.getByText("WORLD'S END")).toBeTruthy();
    expect(worldsEnd.getByText('止☆1')).toBeTruthy();
    expect(worldsEnd.getAllByText('—').length).toBeGreaterThan(0);
    expect(worldsEnd.queryByText('定数 —')).toBeNull();
    expect(worldsEnd.queryByText('定数 0.0')).toBeNull();
    const worldsEndNotes = within(worldsEnd.getByLabelText('中二谱面物量'));
    expect(worldsEndNotes.getByText('FLICK')).toBeTruthy();
    expect(worldsEndNotes.getByText('0')).toBeTruthy();
  });

  it("adapts the WORLD'S END card to dark mode", async () => {
    mockDarkTheme = true;
    const screen = await render(<ChunithmSongDetail songId="3" initialLevelIndex={5} />);
    const worldsEnd = within(screen.getByTestId('chunithm-detail-difficulty-5'));

    expect(StyleSheet.flatten(worldsEnd.getByTestId('chunithm-worlds-end-card-overlay').props.style))
      .toMatchObject({ backgroundColor: 'rgba(20,14,38,0.62)' });
    expect(StyleSheet.flatten(worldsEnd.getByText('止☆1').props.style))
      .toMatchObject({ color: '#FFFFFF' });
    expect(StyleSheet.flatten(
      worldsEnd.getByTestId('chunithm-special-tag-surface-5').props.style,
    )).toMatchObject({ backgroundColor: 'rgba(12,9,22,0.76)' });
  });

  it('falls back to catalog metadata and offers detail retry when notes are unavailable', async () => {
    mockCatalogState = {
      ...mockCatalog,
      songs: [{
        ...song,
        difficulties: song.difficulties.map(({ notes: _notes, ...difficulty }) => difficulty),
      }],
    };
    mockDetailState = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('network'),
    };
    const screen = await render(<ChunithmSongDetail songId="3" />);
    const master = within(screen.getByTestId('chunithm-detail-difficulty-3'));
    expect(master.getByText('物量暂不可用')).toBeTruthy();
    await fireEvent.press(master.getByText('重试读取单曲详情'));
    expect(mockDetailRefetch).toHaveBeenCalled();
  });
});
