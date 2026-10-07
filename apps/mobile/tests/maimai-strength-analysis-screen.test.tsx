import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import StrengthAnalysisToolScreen from '../app/tools/strength-analysis';
import type { CatalogSnapshot, ScoreRecord } from '@/domain/models';
import { useThemeStore } from '@/state/theme-store';
import { getGameToolbox } from '@/domain/game-toolbox';

const mockPush = jest.fn();
const mockFetch = jest.fn<(url: string, init?: RequestInit) => Promise<Response>>();
let mockFocused = true;
let mockSession = { activeGameId: 'maimai', activeAccountId: 'first' };
let mockRecords: ScoreRecord[];
let mockCatalog: CatalogSnapshot;
let mockScoreQuery: Record<string, unknown>;
let mockCatalogQuery: Record<string, unknown>;

jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) }, Stack: { Screen: () => null } }));
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<object>('@react-navigation/native'), useIsFocused: () => mockFocused,
}));
jest.mock('@/state/session-store', () => ({ useSession: (select: (state: typeof mockSession) => unknown) => select(mockSession) }));
jest.mock('@/hooks/use-score-snapshot', () => ({ useScoreSnapshot: () => mockScoreQuery }));
jest.mock('@/hooks/use-detailed-catalog', () => ({ useDetailedCatalog: () => mockCatalogQuery }));
jest.mock('expo/fetch', () => ({ fetch: (url: string, init?: RequestInit) => mockFetch(url, init) }));
jest.mock('expo-image', () => {
  const { Image } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Image: (props: React.ComponentProps<typeof Image>) => <Image {...props} /> };
});
jest.mock('@/storage/sqlite-snapshot-repository', () => {
  const values = new Map<string, unknown>();
  return { values, SqliteSnapshotRepository: class {
    async getResource(key: string) { return values.get(key) ?? null; }
    async saveResource(key: string, _version: number, _time: string, value: unknown) { values.set(key, value); }
  } };
});
jest.mock('@/components/AppModal', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { AppModal: ({ visible, children }: { visible: boolean; children: ReactNode }) => visible ? <View>{children}</View> : null };
});

function record(id: number): ScoreRecord {
  return { songId: String(id), title: `Song ${id}`, type: 'DX', levelIndex: 3, level: '13', difficulty: 'master',
    difficultyConstant: 13, achievements: 100.5, rating: 280, dxScore: null, fc: null, fs: null, rate: 'sssp', version: 'current' };
}
function response() {
  const library = Object.fromEntries(mockCatalog.songs.map(song => [Number(song.id) + 10000,
    [{ difficulty: 3, scores: song.id === '4' ? [8, 8, 6, 7, 8] : [4, 5, 6, 7, 8] }]]));
  return new Response(JSON.stringify(library), { status: 200 });
}
const clients: QueryClient[] = [];
async function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  const tree = () => <QueryClientProvider client={client}><StrengthAnalysisToolScreen /></QueryClientProvider>;
  const screen = await render(tree());
  return { screen, client, tree };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFocused = true;
  useThemeStore.setState({ scoreCardArtworkEnabled: false });
  mockSession = { activeGameId: 'maimai', activeAccountId: 'first' };
  mockRecords = [record(1), record(2), record(3)];
  mockCatalog = { currentVersion: { id: 1, title: 'current' }, versions: [], chartVersionIndex: {},
    source: { kind: 'lxns', label: 'LXNS', updatedAt: '', isStale: false },
    songs: [...mockRecords, record(4)].map(item => ({ id: item.songId, title: item.title, version: 'current', charts: [{ songId: item.songId, type: item.type, levelIndex: item.levelIndex, level: item.level,
      difficulty: item.difficulty, difficultyConstant: item.difficultyConstant }] })) };
  mockScoreQuery = { data: { records: mockRecords }, isLoading: false, isError: false, refetch: jest.fn() };
  mockCatalogQuery = { data: mockCatalog, isLoading: false, isError: false, refetch: jest.fn() };
  (jest.requireMock('@/storage/sqlite-snapshot-repository') as { values: Map<string, unknown> }).values.clear();
  mockFetch.mockImplementation(async () => response());
});
afterEach(() => { for (const client of clients.splice(0)) client.clear(); });

it('opens from the toolbox, shows recommendations and navigates from supporting scores with chart identity', async () => {
  useThemeStore.setState({ scoreCardArtworkEnabled: true });
  mockScoreQuery = { ...mockScoreQuery, isDataStale: true };
  expect(getGameToolbox('maimai').tools.find(tool => tool.title === '实力分析')?.href).toBe('/tools/strength-analysis');
  const { screen } = await mount();
  await waitFor(() => expect(screen.getByText('Song 4')).toBeTruthy());
  expect(screen.getAllByText('-')).toHaveLength(2);
  expect(screen.queryByText('未游玩')).toBeNull();
  expect(screen.queryByText(/缓存数据/)).toBeNull();
  await waitFor(() => expect(screen.getByTestId('score-card-artwork').props.source)
    .toBe('https://assets2.lxns.net/maimai/jacket/4.png'));
  await fireEvent.press(screen.getByText('Song 4'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/songs/[songId]', params: { songId: '4', gameId: 'maimai', chartType: 'DX', levelIndex: '3' } });
  expect(screen.getByText('分析：爆发倾向型')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('maimai-difficulty-radar-axis-strength-0'));
  expect(screen.getByText('完成')).toBeTruthy();
  expect(screen.getByText('Song 2')).toBeTruthy();
  expect(screen.getByText('Song 3')).toBeTruthy();
  await fireEvent.press(screen.getByText('Song 1'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/songs/[songId]', params: { songId: '1', gameId: 'maimai', chartType: 'DX', levelIndex: '3' } });
  expect(screen.queryByText('完成')).toBeNull();
  expect(screen.queryByText(/SSS?[+]?[ ·]/)).toBeNull();
  expect(screen.queryByText(/计算说明|特征文件|样本较少|支撑成绩/)).toBeNull();
});

it('retries a library failure and excludes missing charts and difficulties from partial data', async () => {
  mockFetch.mockImplementation(async () => new Response('', { status: 500 }));
  const { screen } = await mount();
  await waitFor(() => expect(screen.getByText('部分数据加载失败，点击重试')).toBeTruthy());
  mockFetch.mockImplementation(async () => new Response(JSON.stringify({
    '10001': [{ difficulty: 3, scores: [4, 5, 6, 7, 8] }],
    '10002': [{ difficulty: 2, scores: [4, 5, 6, 7, 8] }],
  }), { status: 200 }));
  await fireEvent.press(screen.getByText('部分数据加载失败，点击重试'));
  await waitFor(() => expect(screen.queryByText('部分数据加载失败，点击重试')).toBeNull());
  expect(screen.getByTestId('maimai-difficulty-radar-shape-strength')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('maimai-difficulty-radar-axis-strength-0'));
  expect(screen.getByText('Song 1')).toBeTruthy();
  expect(screen.queryByText('Song 2')).toBeNull();
  expect(screen.queryByText('Song 3')).toBeNull();
  expect(mockFetch.mock.calls.map(([url]) => url)).toEqual([
    'https://rranker-maimai-data.cn-nb1.rains3.com/DXTag/all.json',
    'https://rranker-maimai-data.cn-nb1.rains3.com/DXTag/all.json',
  ]);
});

it('closes the old account sheet and never shows its strengths for a newly selected account', async () => {
  const { screen, tree } = await mount();
  await waitFor(() => expect(screen.getByText('Song 4')).toBeTruthy());
  await fireEvent.press(screen.getByTestId('maimai-difficulty-radar-axis-strength-0'));
  mockSession = { ...mockSession, activeAccountId: 'second' };
  mockScoreQuery = { ...mockScoreQuery, data: { records: [] } };
  await screen.rerender(tree());
  expect(screen.queryByText('完成')).toBeNull();
  expect(screen.queryByText('分析：爆发倾向型')).toBeNull();
  expect(screen.queryByTestId('maimai-difficulty-radar-shape-strength')).toBeNull();
  expect(screen.queryByText('Song 1')).toBeNull();
});

it('waits for focus and loads every chart with one library request', async () => {
  mockFocused = false;
  const { screen, tree } = await mount();
  expect(mockFetch).not.toHaveBeenCalled();
  mockFocused = true;
  await screen.rerender(tree());
  await waitFor(() => expect(screen.getByText('Song 4')).toBeTruthy());
  await fireEvent.press(screen.getByTestId('maimai-difficulty-radar-axis-strength-0'));
  expect(screen.getByText('Song 1')).toBeTruthy();
  expect(screen.getByText('Song 2')).toBeTruthy();
  expect(screen.getByText('Song 3')).toBeTruthy();
  expect(mockFetch.mock.calls.map(([url]) => url)).toEqual([
    'https://rranker-maimai-data.cn-nb1.rains3.com/DXTag/all.json',
  ]);
});

it('checks library coverage again when the LXNS catalog updates while open', async () => {
  const { screen, tree } = await mount();
  await waitFor(() => expect(screen.getByText('Song 4')).toBeTruthy());
  mockCatalog = { ...mockCatalog,
    source: { ...mockCatalog.source, updatedAt: '2026-10-07T00:00:00.000Z' },
    songs: [...mockCatalog.songs, { id: '5', title: 'Song 5', version: 'current', charts: [record(5)] }],
  };
  mockCatalogQuery = { ...mockCatalogQuery, data: mockCatalog };
  mockScoreQuery = { ...mockScoreQuery, data: { records: [...mockRecords, record(5)] } };
  await screen.rerender(tree());
  await waitFor(() => expect(screen.getByTestId('maimai-difficulty-radar-axis-strength-0')).toBeTruthy());
  expect(mockFetch).toHaveBeenCalledTimes(2);
  await fireEvent.press(screen.getByTestId('maimai-difficulty-radar-axis-strength-0'));
  await waitFor(() => expect(screen.getByText('Song 5')).toBeTruthy());
});

it('only includes scores at or above 100.5% without offering a target selector', async () => {
  mockRecords[0].achievements = 100.4999;
  const { screen } = await mount();
  await waitFor(() => expect(screen.getByTestId('maimai-difficulty-radar-axis-strength-0')).toBeTruthy());
  await fireEvent.press(screen.getByTestId('maimai-difficulty-radar-axis-strength-0'));
  await waitFor(() => expect(screen.getByText('Song 3')).toBeTruthy());
  expect(screen.getByText('Song 2')).toBeTruthy();
  expect(screen.queryByText('Song 1')).toBeNull();
});
