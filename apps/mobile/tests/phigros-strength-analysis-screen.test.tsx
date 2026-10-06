import { fireEvent, render, within } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import type { ReactNode } from 'react';
import PhigrosStrengthAnalysisScreen from '../app/tools/strength-analysis';
import type { CatalogSnapshot } from '@/domain/models';
import { buildPhigrosKyouChartTagIndex, type PhigrosKyouChartTagsSnapshot } from '@/domain/phigros-kyou';
import {
  analyzePhigrosStrength,
  describePhigrosStrengthUnexpectedPrimaryAxes,
} from '@/domain/phigros-strength-analysis';

const unexpectedPrimaryAxes = describePhigrosStrengthUnexpectedPrimaryAxes();

const mockGameRefetch = jest.fn(async () => undefined);
const mockCatalogRefetch = jest.fn(async () => undefined);
const mockTagsRefetch = jest.fn(async () => undefined);
const mockPush = jest.fn();

let mockGameQuery: Record<string, unknown>;
let mockCatalogQuery: Record<string, unknown>;
let mockTagsQuery: Record<string, unknown>;

jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  Stack: { Screen: () => null },
}));
jest.mock('@/components/AppModal', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    AppModal: ({ visible, children }: { visible?: boolean; children: ReactNode }) => (
      visible ? <View>{children}</View> : null
    ),
  };
});
jest.mock('@/hooks/use-game-data', () => ({ useGameData: () => mockGameQuery }));
jest.mock('@/hooks/use-phigros-catalog', () => ({ usePhigrosCatalog: () => mockCatalogQuery }));
jest.mock('@/hooks/use-phigros-kyou', () => ({ usePhigrosKyouChartTags: () => mockTagsQuery }));

const source = {
  kind: 'kyou' as const,
  label: 'Kyou',
  updatedAt: '2026-08-09T00:00:00.000Z',
  isStale: false,
};

const tags = [
  { id: 1, name: '读谱', type: 'primary' as const, parentIds: [], description: '' },
  { id: 2, name: '耐力', type: 'primary' as const, parentIds: [], description: '' },
  { id: 3, name: '协调', type: 'primary' as const, parentIds: [], description: '' },
  { id: 4, name: '手速', type: 'primary' as const, parentIds: [], description: '' },
  { id: 5, name: '多指', type: 'primary' as const, parentIds: [], description: '' },
  { id: 10, name: '差速', type: 'secondary' as const, parentIds: [1], description: '' },
];

const catalogSnapshot = {
  currentVersion: { id: 1, title: 'current' },
  versions: [{ id: 1, title: 'current' }],
  songs: [{
    id: 'song',
    title: 'Song',
    version: 'Pack',
    charts: [
      { songId: 'song', type: 'SD' as const, levelIndex: 2, level: 'IN', difficulty: 'expert' as const, difficultyConstant: 16 },
      { songId: 'song', type: 'SD' as const, levelIndex: 3, level: 'AT', difficulty: 'master' as const, difficultyConstant: 16.2 },
    ],
  }],
  chartVersionIndex: {},
  source,
};

const kyouCharts = [
  { chartId: 'k-in', songId: 'k-song', songName: 'Song', difficulty: 'in' as const, constant: 16, mainLabel: '', mainLabelQuestion: false, mainTopVotes: 30, mainSecondVotes: 10, tagSource: 'Kyou' },
  { chartId: 'k-at', songId: 'k-song', songName: 'Song', difficulty: 'at' as const, constant: 16.2, mainLabel: '', mainLabelQuestion: false, mainTopVotes: 21, mainSecondVotes: 20, tagSource: 'Kyou' },
];

const tagSnapshot = {
  songs: [{ songId: 'k-song', name: 'Song', pack: 'Pack' }],
  charts: kyouCharts,
  tags,
  votes: [
    { chartId: 'k-in', songId: 'k-song', songName: 'Song', difficulty: 'in' as const, tagType: 'primary' as const, tagId: 1, tag: '读谱', votes: 30, parentIds: [], source: 'Kyou' },
    { chartId: 'k-in', songId: 'k-song', songName: 'Song', difficulty: 'in' as const, tagType: 'primary' as const, tagId: 2, tag: '耐力', votes: 10, parentIds: [], source: 'Kyou' },
    { chartId: 'k-in', songId: 'k-song', songName: 'Song', difficulty: 'in' as const, tagType: 'secondary' as const, tagId: 10, tag: '差速', votes: 4, parentIds: [1], source: 'Kyou' },
    { chartId: 'k-at', songId: 'k-song', songName: 'Song', difficulty: 'at' as const, tagType: 'primary' as const, tagId: 1, tag: '读谱', votes: 20, parentIds: [], source: 'Kyou' },
    { chartId: 'k-at', songId: 'k-song', songName: 'Song', difficulty: 'at' as const, tagType: 'primary' as const, tagId: 2, tag: '耐力', votes: 21, parentIds: [], source: 'Kyou' },
  ],
  source,
};

function score(levelIndex: number, rating: number, rate: string) {
  return {
    songId: 'song', title: 'Song', type: 'SD' as const, levelIndex,
    level: levelIndex === 2 ? 'IN' : 'AT', difficulty: 'master' as const,
    difficultyConstant: rating, achievements: 99, dxScore: 990000,
    rating, fc: null, fs: null, rate, version: 'current',
  };
}

function renderedAnalysis() {
  return analyzePhigrosStrength(
    16.1691,
    [score(2, 15.9, 'a'), score(3, 16.1, 's')],
    buildPhigrosKyouChartTagIndex(
      tagSnapshot as PhigrosKyouChartTagsSnapshot,
      catalogSnapshot as unknown as CatalogSnapshot,
    ),
    tags,
    catalogSnapshot as unknown as CatalogSnapshot,
  );
}

function setSuccessfulQueries(stale = false) {
  mockGameQuery = {
    isLoading: false, isError: false, isDataStale: stale, refetch: mockGameRefetch,
    data: {
      payload: {
        kind: 'phigros',
        player: { id: 'p', displayName: 'Player', rating: 16.1691, source },
        playerScore: { label: 'Raking Score', value: 16.1691, display: '16.1691' },
        records: [score(2, 15.9, 'a'), score(3, 16.1, 's')],
      },
    },
  };
  mockCatalogQuery = {
    isLoading: false, isError: false, refetch: mockCatalogRefetch,
    data: { snapshot: catalogSnapshot },
  };
  mockTagsQuery = {
    isLoading: false, isError: false, refetch: mockTagsRefetch,
    data: { ...tagSnapshot, source: { ...source, isStale: stale } },
  };
}

describe('Phigros strength analysis screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setSuccessfulQueries();
  });

  it('renders the profile, axis values, score cards and selected-song sheet', async () => {
    const analysis = renderedAnalysis();
    const screen = await render(<PhigrosStrengthAnalysisScreen />);
    const readingTag = analysis.mainTags.find((tag) => tag.name === '读谱');
    const firstPractice = analysis.recommendations[0];
    expect(readingTag).toBeTruthy();
    expect(firstPractice).toBeTruthy();
    expect(screen.getByText(`分析：${analysis.mainTagProfileLabel}`)).toBeTruthy();
    expect(screen.queryByText('五维主标签')).toBeNull();
    expect(screen.queryByText('细分标签')).toBeNull();
    expect(screen.queryByText('差速')).toBeNull();
    expect(screen.queryByLabelText('展开分析池说明')).toBeNull();
    expect(screen.queryByText(/针对 /)).toBeNull();
    const axisValueCounts = new Map<string, number>();
    for (const tag of analysis.mainTags) {
      const value = tag.averageRks == null ? '—' : tag.averageRks.toFixed(4);
      axisValueCounts.set(value, (axisValueCounts.get(value) ?? 0) + 1);
    }
    for (const [value, count] of axisValueCounts) {
      expect(screen.getAllByText(value)).toHaveLength(count);
    }
    expect(screen.getByText('薄弱项练习')).toBeTruthy();
    expect(screen.getAllByText('99%').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('查看谱面 Song')).toHaveLength(analysis.recommendations.length);
    await fireEvent.press(screen.getAllByLabelText('查看谱面 Song')[0]!);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/songs/[songId]',
      params: {
        songId: firstPractice!.songId,
        levelIndex: String(firstPractice!.levelIndex),
        gameId: 'phigros',
      },
    });

    await fireEvent.press(screen.getByLabelText('查看读谱标签歌曲列表'));
    const sheet = screen.getByTestId('phigros-strength-tag-songs-sheet');
    expect(within(sheet).getByText('读谱')).toBeTruthy();
    expect(within(sheet).queryByText(/覆盖/)).toBeNull();
    expect(within(sheet).getAllByLabelText('查看谱面 Song')).toHaveLength(readingTag!.charts.length);
    expect(within(sheet).getByText('15.90')).toBeTruthy();
    await fireEvent.press(within(sheet).getAllByLabelText('查看谱面 Song')[0]!);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/songs/[songId]',
      params: {
        songId: readingTag!.charts[0]!.songId,
        levelIndex: String(readingTag!.charts[0]!.levelIndex),
        gameId: 'phigros',
      },
    });
    expect(screen.queryByTestId('phigros-strength-tag-songs-sheet')).toBeNull();

    await fireEvent.press(screen.getByLabelText('查看读谱标签歌曲列表'));
    await fireEvent.press(screen.getByLabelText('关闭标签歌曲列表'));
    expect(screen.queryByTestId('phigros-strength-tag-songs-sheet')).toBeNull();
  });

  it('marks stale cache-backed analysis', async () => {
    setSuccessfulQueries(true);
    const screen = await render(<PhigrosStrengthAnalysisScreen />);
    expect(screen.getByText('当前使用缓存数据，联网同步后结果会自动更新。')).toBeTruthy();
  });

  it('shows the binding empty state before offering analysis', async () => {
    setSuccessfulQueries();
    mockGameQuery = {
      isLoading: false, isError: false, isDataStale: false, refetch: mockGameRefetch,
      data: { payload: { kind: 'empty', gameId: 'phigros', displayName: 'Phigros', source } },
    };
    const screen = await render(<PhigrosStrengthAnalysisScreen />);
    expect(screen.getByText('尚未绑定 TapTap')).toBeTruthy();
  });

  it('retries all required sources after a load error', async () => {
    setSuccessfulQueries();
    mockTagsQuery = { isLoading: false, isError: true, refetch: mockTagsRefetch, data: undefined };
    const screen = await render(<PhigrosStrengthAnalysisScreen />);
    await fireEvent.press(screen.getByLabelText('重试实力分析'));
    expect(mockGameRefetch).toHaveBeenCalledTimes(1);
    expect(mockCatalogRefetch).toHaveBeenCalledTimes(1);
    expect(mockTagsRefetch).toHaveBeenCalledTimes(1);
  });

  it('renders the axis mismatch text from the policy instead of a hard-coded count', async () => {
    setSuccessfulQueries();
    mockTagsQuery = {
      isLoading: false, isError: false, refetch: mockTagsRefetch,
      data: { ...tagSnapshot, tags: tags.filter((tag) => tag.id !== 5) },
    };
    const screen = await render(<PhigrosStrengthAnalysisScreen />);
    expect(screen.getByText('标签结构暂不可用')).toBeTruthy();
    expect(screen.getByText(unexpectedPrimaryAxes)).toBeTruthy();
  });
});
