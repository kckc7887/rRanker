import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import ToolsScreen from '../app/tools/index';
import type { GameId } from '@/domain/game-bind-options';

let mockActiveGameId: GameId = 'maimai';
let mockPinnedToolIds: string[] = [];
const mockHydratePins = jest.fn(async () => undefined);
const mockTogglePinnedTool = jest.fn(async (_gameId?: GameId, _toolId?: string) => undefined);
const mockRouterPush = jest.fn();
const mockShowNotification = jest.fn();

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { push: mockRouterPush },
}));
jest.mock('@/components/AppNotification', () => ({
  useNotification: () => ({ showNotification: mockShowNotification, showActionNotification: jest.fn() }),
}));
jest.mock('@/state/session-store', () => ({
  useSession: (selector: (state: { activeGameId: GameId }) => unknown) => selector({
    activeGameId: mockActiveGameId,
  }),
}));
jest.mock('@/state/toolbox-pins', () => ({
  useToolboxPins: (selector: (state: {
    pinnedToolIdsByGame: Record<GameId, string[]>;
    hydrate: typeof mockHydratePins;
    togglePinnedTool: typeof mockTogglePinnedTool;
  }) => unknown) => selector({
    pinnedToolIdsByGame: { maimai: mockPinnedToolIds, phigros: [], test: [] },
    hydrate: mockHydratePins,
    togglePinnedTool: mockTogglePinnedTool,
  }),
}));

describe('game-aware toolbox screen', () => {
  beforeEach(() => {
    mockActiveGameId = 'maimai';
    mockPinnedToolIds = [];
    jest.clearAllMocks();
  });

  it('renders tools registered for the active game', async () => {
    mockActiveGameId = 'maimai';
    const screen = await render(<ToolsScreen />);
    expect(screen.getByText('DX Rating 计算器')).toBeTruthy();
    expect(screen.getByText('版本对照与总结')).toBeTruthy();
    expect(screen.getByText('随机歌曲')).toBeTruthy();
  });

  it('renders the active Phigros tools without a maimai branch', async () => {
    mockActiveGameId = 'phigros';
    const screen = await render(<ToolsScreen />);
    expect(screen.getByText('推分计算')).toBeTruthy();
    expect(screen.getByText('生成成绩图片')).toBeTruthy();
    expect(screen.queryByText('DX Rating 计算器')).toBeNull();
  });

  it('toggles a tool pin without opening the tool card', async () => {
    const screen = await render(<ToolsScreen />);
    await fireEvent.press(screen.getByLabelText('置顶 DX Rating 计算器'));
    await waitFor(() => expect(mockTogglePinnedTool).toHaveBeenCalledWith('maimai', 'rating'));
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('shows the active state for an already pinned tool', async () => {
    mockPinnedToolIds = ['rating'];
    const screen = await render(<ToolsScreen />);
    expect(screen.getByLabelText('取消置顶 DX Rating 计算器')).toBeTruthy();
    expect(screen.getByText('已置顶')).toBeTruthy();
  });

  it('shows a global error notification when pin persistence fails', async () => {
    mockTogglePinnedTool.mockRejectedValueOnce(new Error('disk full'));
    const screen = await render(<ToolsScreen />);
    await fireEvent.press(screen.getByLabelText('置顶 DX Rating 计算器'));
    await waitFor(() => expect(mockShowNotification).toHaveBeenCalledWith({
      title: '保存失败',
      message: '无法保存工具置顶状态，请稍后重试。',
      variant: 'error',
    }));
  });
});
