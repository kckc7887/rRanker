import { render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import ToolsScreen from '../app/tools/index';
import type { GameId } from '@/domain/game-bind-options';

let mockActiveGameId: GameId = 'maimai';

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { push: jest.fn() },
}));
jest.mock('@/state/session-store', () => ({
  useSession: (selector: (state: { activeGameId: GameId }) => unknown) => selector({
    activeGameId: mockActiveGameId,
  }),
}));

describe('game-aware toolbox screen', () => {
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
});
