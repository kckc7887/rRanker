import { fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import PhigrosStrengthAnalysisScreen from '../app/tools/strength-analysis';

const mockGameRefetch = jest.fn(async () => undefined);
const mockCatalogRefetch = jest.fn(async () => undefined);
const mockTagsRefetch = jest.fn(async () => undefined);

let mockGameQuery: Record<string, unknown>;
let mockCatalogQuery: Record<string, unknown>;
let mockTagsQuery: Record<string, unknown>;

jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));
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

  it('renders the pool, five-axis summary, detailed tags and accessibility description', async () => {
    const screen = await render(<PhigrosStrengthAnalysisScreen />);
    expect(screen.getByText('RKS ≥ 15.9 · A 及以上')).toBeTruthy();
    expect(screen.getByText('16.1691')).toBeTruthy();
    expect(screen.getByText('五维主标签')).toBeTruthy();
    expect(screen.getByLabelText(/五维实力雷达/)).toBeTruthy();
    expect(screen.getByText('差速')).toBeTruthy();
    expect(screen.getByText('样本较少')).toBeTruthy();
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
});
