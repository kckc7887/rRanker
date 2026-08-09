import { fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import KaleidxScopeToolScreen from '../app/tools/kaleidx-scope';

const mockRouterPush = jest.fn();
const mockToggleSong = jest.fn(async () => undefined);
const mockClearRun = jest.fn(async () => undefined);
const mockSetKeyObtained = jest.fn(async () => undefined);
const mockSetGateCleared = jest.fn(async () => undefined);
const mockHydrate = jest.fn(async () => undefined);
const mockShowNotification = jest.fn();

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
    data: { songs: [{ id: '11740' }, { id: '11814' }] },
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
  beforeEach(() => jest.clearAllMocks());

  it('renders all six gates and switches condition-aware trackers', async () => {
    const screen = await render(<KaleidxScopeToolScreen />);
    for (const label of ['蓝色之门', '白色之门', '紫色之门', '黑色之门', '黄色之门', '红色之门']) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    expect(screen.getByText('完成青春区域收录的全部 29 首钥匙曲目')).toBeTruthy();
    expect(screen.getByText('果ての空、僕らが見た光。')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('白色之门'));
    expect(screen.getByText('先将背景设置为「Latent Kingdom」')).toBeTruthy();
    expect(screen.getByLabelText('单人 3 首计划')).toBeTruthy();
    expect(screen.getByLabelText('多人 4 首计划')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('黄色之门'));
    expect(screen.getByText('这里仅记录机台随机命中的歌曲，不代替游戏内「随机选曲」。')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('红色之门'));
    expect(screen.getByText('FLΛME/FRΦST')).toBeTruthy();
    expect(screen.getByText('开放 2026.08.05')).toBeTruthy();
  });

  it('records progress, status, and routes only catalog-known songs', async () => {
    const screen = await render(<KaleidxScopeToolScreen />);
    await fireEvent.press(screen.getByLabelText('标记完成 STEREOSCAPE'));
    expect(mockToggleSong).toHaveBeenCalledWith('maimai:local:test', 'blue', '11009', undefined);

    await fireEvent.press(screen.getByLabelText('钥匙已取得'));
    await fireEvent.press(screen.getByLabelText('门曲已通关'));
    expect(mockSetKeyObtained).toHaveBeenCalledWith('maimai:local:test', 'blue', true);
    expect(mockSetGateCleared).toHaveBeenCalledWith('maimai:local:test', 'blue', true);

    await fireEvent.press(screen.getByLabelText('查看歌曲 果ての空、僕らが見た光。'));
    expect(mockRouterPush).toHaveBeenCalledWith({ pathname: '/songs/[songId]', params: { songId: '11740' } });
    expect(screen.queryByLabelText('查看歌曲 STEREOSCAPE')).toBeNull();
    expect(screen.getAllByText(/曲库尚未同步/).length).toBeGreaterThan(0);
  });
});
