import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import ToolsScreen from '../app/tools/index';
import type { GameId } from '@/domain/game-bind-options';

let mockActiveGameId: GameId = 'maimai';
let mockPinnedToolIds: string[] = [];
const mockHydratePins = jest.fn(async () => undefined);
const mockTogglePinnedTool = jest.fn(async (_gameId?: GameId, _toolId?: string) => undefined);
const mockRouterPush = jest.fn();

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { push: mockRouterPush },
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
  });

  it('renders the active game empty state without a maimai branch', async () => {
    mockActiveGameId = 'phigros';
    const screen = await render(<ToolsScreen />);
    expect(screen.getByText('Phigros 工具正在准备中。')).toBeTruthy();
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
});
