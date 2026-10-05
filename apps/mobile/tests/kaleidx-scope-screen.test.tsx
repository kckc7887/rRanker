import { fireEvent, render, within } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import KaleidxScopeToolScreen from '../app/tools/kaleidx-scope';

const mockRouterPush = jest.fn();
const mockToggleSong = jest.fn(async () => undefined);
const mockClearRun = jest.fn(async () => undefined);
const mockSetKeyObtained = jest.fn(async () => undefined);
const mockSetGateCleared = jest.fn(async () => undefined);
const mockHydrate = jest.fn(async () => undefined);
const mockShowNotification = jest.fn();
const initialCatalogSongs = [
  { id: '1740', charts: [{ type: 'DX' }] }, { id: '1814', charts: [{ type: 'DX' }] },
  { id: '1736', charts: [{ type: 'SD' }, { type: 'DX' }] },
  { id: '835', charts: [{ type: 'SD' }, { type: 'DX' }] },
  { id: '1819', charts: [{ type: 'SD' }] }, { id: '1820', charts: [{ type: 'DX' }] },
  { id: '1821', charts: [{ type: 'DX' }] },
];
let mockCatalogSongs = initialCatalogSongs;

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { push: (...args: unknown[]) => mockRouterPush(...args) },
}));
jest.mock('@/components/SongCover', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { SongCover: ({ songId }: { songId: string }) => <Text>{`封面 ${songId}`}</Text> };
});
jest.mock('@/components/AppNotification', () => ({
  useNotification: () => ({ showNotification: mockShowNotification, showActionNotification: jest.fn() }),
}));
jest.mock('@/state/session-store', () => ({
  useSession: (selector: (state: { activeAccountId: string }) => unknown) => selector({ activeAccountId: 'maimai:local:test' }),
}));
jest.mock('@/hooks/use-detailed-catalog', () => ({
  useDetailedCatalog: () => ({
    data: { songs: mockCatalogSongs },
    isLoading: false,
    isError: false,
  }),
}));
jest.mock('@/state/kaleidx-scope-progress', () => ({
  selectKaleidxGateProgress: (state: { byAccount: Record<string, Record<string, unknown>> }, accountId: string, gateId: string) => state.byAccount[accountId]?.[gateId] ?? {
    completedSongIds: [], soloSongIds: [], multiSongIds: [], keyObtained: false, gateCleared: false,
  },
  useKaleidxScopeProgress: (selector: (state: unknown) => unknown) => selector({
    hydrated: true,
    byAccount: {},
    hydrate: mockHydrate,
    toggleSong: mockToggleSong,
    clearRun: mockClearRun,
    setKeyObtained: mockSetKeyObtained,
    setGateCleared: mockSetGateCleared,
  }),
}));

describe('KALEIDX◈SCOPE tool screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCatalogSongs = initialCatalogSongs;
  });

  it('offers all ten stages and completion-only tracking without prerequisite locks', async () => {
    const screen = await render(<KaleidxScopeToolScreen />);
    expect(screen.getAllByRole('tab')).toHaveLength(10);
    for (const [label, id, completion] of [
      ['棱镜塔', 'prism', '棱镜塔已通关'], ['ERROR 阶段', 'error', 'ERROR 阶段已完成'],
      ['希望之门', 'hope', '希望之门已通关'], ['最终挑战', 'final', '最终挑战已完成'],
    ]) {
      await fireEvent.press(screen.getByLabelText(label));
      expect(screen.queryByText('钥匙进度')).toBeNull();
      expect(screen.queryByText('0/0')).toBeNull();
      expect(screen.queryByLabelText('钥匙已取得')).toBeNull();
      expect(screen.getAllByText(/尚未记录完成/).length).toBeGreaterThan(0);
      await fireEvent.press(screen.getByLabelText(completion));
      expect(mockSetGateCleared).toHaveBeenLastCalledWith('maimai:local:test', id, true);
    }
  });

  it('renders prism pools, an ERROR story, and fixed hope tracks with explicit chart types', async () => {
    const screen = await render(<KaleidxScopeToolScreen />);
    await fireEvent.press(screen.getByLabelText('棱镜塔'));
    expect(screen.getByText('7sRef 区域 4 · 2000 km')).toBeTruthy();
    expect(screen.getByText("World's end BLACKBOX")).toBeTruthy();
    expect(within(screen.getByTestId('kaleidx-unlock-prism')).getByText('Amereistr')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('展开 TRACK 1 随机池'));
    expect(screen.getByText('IMBRUED:FLUX')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('ERROR 阶段'));
    const errorChallenge = within(screen.getByTestId('kaleidx-challenge-error'));
    expect(errorChallenge.getByText('TRACK 3 · 乱码课题')).toBeTruthy();
    expect(errorChallenge.queryByText('Xaleid◆scopiX')).toBeNull();
    expect(errorChallenge.queryByRole('link')).toBeNull();
    expect(screen.queryByTestId('kaleidx-schedule-error')).toBeNull();
    await fireEvent.press(screen.getByLabelText('希望之门'));
    expect(screen.queryByLabelText('展开 TRACK 1 随机池')).toBeNull();
    for (const [title, songId, chartType] of [
      ['プリズム△▽リズム', '1736', 'SD'], ['Believe the Rainbow', '835', 'DX'], ['AFTER PANDORA', '1819', 'SD'],
    ]) {
      await fireEvent.press(screen.getByLabelText(`查看歌曲 ${title}`));
      expect(mockRouterPush).toHaveBeenLastCalledWith({ pathname: '/songs/[songId]', params: { songId, chartType, gameId: 'maimai' } });
    }
  });

  it('shows estimated dual LIFE separately from current conditions and includes rewards and sources', async () => {
    const screen = await render(<KaleidxScopeToolScreen />);
    await fireEvent.press(screen.getByLabelText('最终挑战'));
    expect(screen.getByText('Xaleid◆scopiX')).toBeTruthy();
    expect(screen.getByText('Ref:rain (for 7th Heaven)')).toBeTruthy();
    expect(screen.getByText('通关奖励 · 搭档 Ris（リズ）')).toBeTruthy();
    expect(screen.queryByText('TRACK 3 · 固定门曲')).toBeNull();
    expect(screen.queryByText(/EXPERT · LIFE 100/)).toBeNull();
    await fireEvent.press(screen.getByLabelText('展开 缓和参考（推算）'));
    expect(screen.getByText('EXPERT · LIFE 100 / DX LIFE 999')).toBeTruthy();
    expect(screen.getByText('Re:MASTER · LIFE 5 / DX LIFE 待确认')).toBeTruthy();
    expect(screen.getByText('推算按北京时间 04:00 切换')).toBeTruthy();
    expect(screen.getByText('AWMC 活动资料 · 核对 2026-10-03')).toBeTruthy();
    expect(screen.queryAllByLabelText(/当前阶段/)).toHaveLength(0);
    expect(screen.queryByText(/ · 当前/)).toBeNull();
    await fireEvent.press(screen.getByLabelText('收起 缓和参考（推算）'));
    expect(screen.queryByText('EXPERT · LIFE 100 / DX LIFE 999')).toBeNull();
    await fireEvent.press(screen.getByLabelText('展开 资料来源'));
    expect(screen.getByText(/https:\/\/github.com\/AWMC-TEAM/)).toBeTruthy();
  });

  it('disables a known song when the required chart type is missing', async () => {
    mockCatalogSongs = [{ id: '835', charts: [{ type: 'SD' }] }];
    const screen = await render(<KaleidxScopeToolScreen />);
    await fireEvent.press(screen.getByLabelText('希望之门'));
    expect(screen.getByText('Believe the Rainbow')).toBeTruthy();
    expect(screen.queryByLabelText('查看歌曲 Believe the Rainbow')).toBeNull();
    expect(screen.queryByLabelText('查看歌曲 AFTER PANDORA')).toBeNull();
  });

  it('reports a completion save failure and permits a retry', async () => {
    mockSetGateCleared.mockRejectedValueOnce(new Error('write failed'));
    const screen = await render(<KaleidxScopeToolScreen />);
    await fireEvent.press(screen.getByLabelText('最终挑战'));
    await fireEvent.press(screen.getByLabelText('最终挑战已完成'));
    expect(mockShowNotification).toHaveBeenCalledWith({ title: '保存失败', message: '无法保存万花筒进度，请稍后重试。', variant: 'error' });
    await fireEvent.press(screen.getByLabelText('最终挑战已完成'));
    expect(mockSetGateCleared).toHaveBeenCalledTimes(2);
  });

  it('renders all six gates and switches condition-aware trackers', async () => {
    const screen = await render(<KaleidxScopeToolScreen />);
    for (const label of ['蓝色之门', '白色之门', '紫色之门', '黑色之门', '黄色之门', '红色之门']) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    expect(screen.getByText('完成青春区域收录的全部 29 首钥匙曲目')).toBeTruthy();
    expect(screen.getByText('果ての空、僕らが見た光。')).toBeTruthy();
    expect(screen.getByText('钥匙进度')).toBeTruthy();
    expect(screen.queryByText('29 首全部勾选后，仅代表手动记录已满足钥匙曲条件。')).toBeNull();
    expect(within(screen.getByTestId('kaleidx-unlock-blue')).getByText('区域完美挑战')).toBeTruthy();
    expect(within(screen.getByTestId('kaleidx-challenge-blue')).queryByText('区域完美挑战')).toBeNull();

    await fireEvent.press(screen.getByLabelText('展开 钥匙进度'));
    expect(screen.getByText('29 首全部勾选后，仅代表手动记录已满足钥匙曲条件。')).toBeTruthy();

    expect(screen.queryByLabelText('蓝门 2026.02.12起 BASIC LIFE 999，当前阶段')).toBeNull();
    await fireEvent.press(screen.getByLabelText('展开 难度与 LIFE'));
    expect(screen.getByLabelText('蓝门 2026.02.12起 BASIC LIFE 999，当前阶段')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('收起 难度与 LIFE'));
    expect(screen.queryByLabelText('蓝门 2026.02.12起 BASIC LIFE 999，当前阶段')).toBeNull();

    await fireEvent.press(screen.getByLabelText('白色之门'));
    expect(screen.getByText('先将背景设置为「Latent Kingdom」')).toBeTruthy();
    expect(screen.getByLabelText('单人 3 首计划')).toBeTruthy();
    expect(screen.getByLabelText('多人 4 首计划')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('黄色之门'));
    expect(screen.getByText('这里仅记录机台随机命中的歌曲，不代替游戏内「随机选曲」。')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('红色之门'));
    expect(screen.getByText('FLΛME/FRΦST')).toBeTruthy();
    expect(screen.getByText('开放 2026.08.05')).toBeTruthy();
    expect(screen.queryByText('国服 · 六色门')).toBeNull();
    expect(screen.queryByText(/资料核对于/)).toBeNull();
    expect(screen.queryByText('资料来源')).toBeNull();
    expect(screen.queryByText('钥匙条件、单局计划、挑战曲池和 LIFE 缓和阶段集中查询')).toBeNull();
  });

  it('records progress, status, and routes only catalog-known songs', async () => {
    const screen = await render(<KaleidxScopeToolScreen />);
    await fireEvent.press(screen.getByLabelText('展开 钥匙进度'));
    await fireEvent.press(screen.getByLabelText('标记完成 STEREOSCAPE'));
    expect(mockToggleSong).toHaveBeenCalledWith('maimai:local:test', 'blue', '11009', undefined);

    await fireEvent.press(screen.getByLabelText('钥匙已取得'));
    await fireEvent.press(screen.getByLabelText('门曲已通关'));
    expect(mockSetKeyObtained).toHaveBeenCalledWith('maimai:local:test', 'blue', true);
    expect(mockSetGateCleared).toHaveBeenCalledWith('maimai:local:test', 'blue', true);

    await fireEvent.press(screen.getByLabelText('查看歌曲 果ての空、僕らが見た光。'));
    expect(mockRouterPush).toHaveBeenCalledWith({ pathname: '/songs/[songId]', params: { songId: '1740', gameId: 'maimai' } });
    expect(screen.queryByText('#11740 · 门曲 · 曲库尚未同步')).toBeNull();
    expect(screen.queryByLabelText('查看歌曲 STEREOSCAPE')).toBeNull();
    expect(screen.getAllByText(/曲库尚未同步/).length).toBeGreaterThan(0);
  });
});
