import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import StrengthAnalysisToolScreen from '../app/tools/strength-analysis';
import type { CatalogSnapshot, ScoreRecord } from '@/domain/models';
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
    difficultyConstant: 13, achievements: 100, rating: 280, dxScore: null, fc: null, fs: null, rate: 'sss', version: 'current' };
}
function response(scores: number[] = [4, 5, 6, 7, 8]) {
  return new Response(JSON.stringify([{ difficulty: 3, scores }]), { status: 200 });
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
  mockSession = { activeGameId: 'maimai', activeAccountId: 'first' };
  mockRecords = [record(1), record(2), record(3)];
  mockCatalog = { currentVersion: { id: 1, title: 'current' }, versions: [], chartVersionIndex: {},
    source: { kind: 'lxns', label: 'LXNS', updatedAt: '', isStale: false },
    songs: [...mockRecords, record(4)].map(item => ({ id: item.songId, title: item.title, version: 'current', charts: [item] })) };
  mockScoreQuery = { data: { records: mockRecords }, isLoading: false, isError: false, refetch: jest.fn() };
  mockCatalogQuery = { data: mockCatalog, isLoading: false, isError: false, refetch: jest.fn() };
  (jest.requireMock('@/storage/sqlite-snapshot-repository') as { values: Map<string, unknown> }).values.clear();
  mockFetch.mockImplementation(async url => response(url.endsWith('/10004.json') ? [8, 8, 6, 7, 8] : undefined));
});
afterEach(() => { for (const client of clients.splice(0)) client.clear(); });

it('opens from the toolbox, shows recommendations and navigates from supporting scores with chart identity', async () => {
  expect(getGameToolbox('maimai').tools.find(tool => tool.title === '实力分析')?.href).toBe('/tools/strength-analysis');
  const { screen } = await mount();
  await waitFor(() => expect(screen.getByText('训练：键盘、星星 · 目标 100%')).toBeTruthy());
  expect(screen.getByText('未游玩')).toBeTruthy();
  expect(screen.getByText('相对擅长：爆发 · 相对薄弱：键盘')).toBeTruthy();
  await fireEvent.press(screen.getAllByText('键盘')[0]);
  expect(screen.getByText('键盘 · 支撑成绩')).toBeTruthy();
  expect(screen.getAllByText('键盘 4.0')).toHaveLength(3);
  await fireEvent.press(screen.getByText('Song 1'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/songs/[songId]', params: { songId: '1', gameId: 'maimai', chartType: 'DX', levelIndex: '3' } });
  expect(screen.queryByText('键盘 · 支撑成绩')).toBeNull();
  await fireEvent.press(screen.getByText('SSS+ · 100.5%'));
  await waitFor(() => expect(screen.queryByTestId('maimai-difficulty-radar-shape-strength')).toBeNull());
  expect(screen.queryByText('训练：键盘、星星 · 目标 100%')).toBeNull();
  await fireEvent.press(screen.getByText('SS · 99%'));
  await waitFor(() => expect(screen.getByText('训练：键盘、星星 · 目标 99%')).toBeTruthy());
  await fireEvent.press(screen.getByText('计算说明 展开'));
  expect(screen.getByText(/每个维度取达到目标达成率/)).toBeTruthy();
});

it('keeps partial results, distinguishes missing difficulty from failures and retries failed requests', async () => {
  mockFetch.mockImplementation(async url => {
    if (url.endsWith('/10002.json')) return new Response(JSON.stringify([{ difficulty: 2, scores: [4, 5, 6, 7, 8] }]), { status: 200 });
    if (url.endsWith('/10003.json')) return new Response('', { status: 404 });
    if (url.endsWith('/10004.json')) return new Response('', { status: 500 });
    return response();
  });
  const { screen } = await mount();
  await waitFor(() => expect(screen.getByText(/特征文件 4\/4 · 缺失谱面 2 · 失败文件 1/)).toBeTruthy());
  expect(screen.getByTestId('maimai-difficulty-radar-shape-strength')).toBeTruthy();
  await fireEvent.press(screen.getAllByText('键盘')[0]);
  expect(screen.getByText('Song 1')).toBeTruthy();
  await fireEvent.press(screen.getByText('完成'));
  mockFetch.mockImplementation(async () => response([8, 8, 6, 7, 8]));
  await fireEvent.press(screen.getByText('重试失败特征'));
  await waitFor(() => expect(screen.getByText(/特征文件 4\/4 · 缺失谱面 2 · 失败文件 0/)).toBeTruthy());
  expect(screen.queryByText('重试失败特征')).toBeNull();
});

it('closes the old account sheet and never shows its strengths for a newly selected account', async () => {
  const { screen, tree } = await mount();
  await waitFor(() => expect(screen.getByText('训练：键盘、星星 · 目标 100%')).toBeTruthy());
  await fireEvent.press(screen.getAllByText('键盘')[0]);
  mockSession = { ...mockSession, activeAccountId: 'second' };
  mockScoreQuery = { ...mockScoreQuery, data: { records: [] } };
  await screen.rerender(tree());
  expect(screen.queryByText('键盘 · 支撑成绩')).toBeNull();
  expect(screen.queryByText('相对擅长：爆发 · 相对薄弱：键盘')).toBeNull();
  expect(screen.queryByTestId('maimai-difficulty-radar-shape-strength')).toBeNull();
  expect(screen.queryByText('Song 1')).toBeNull();
});

it('bounds active network requests and stops adding work when the screen loses focus', async () => {
  mockRecords = Array.from({ length: 8 }, (_, i) => record(i + 1));
  mockScoreQuery = { ...mockScoreQuery, data: { records: mockRecords } };
  const pending: (() => void)[] = [];
  mockFetch.mockImplementation(() => new Promise(resolve => pending.push(() => resolve(response()))));
  const { screen, tree } = await mount();
  await waitFor(() => expect(pending).toHaveLength(4));
  mockFocused = false;
  await screen.rerender(tree());
  await act(async () => { for (const resolve of pending) resolve(); });
  expect(pending).toHaveLength(4);
  mockFetch.mockImplementation(async () => response());
  mockFocused = true;
  await screen.rerender(tree());
  await waitFor(() => expect(screen.getByText(/特征文件 8\/8/)).toBeTruthy());
  expect(screen.getByText('4.0')).toBeTruthy();
});
