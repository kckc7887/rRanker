import { fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import SettingsScreen from '../app/(tabs)/settings';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({ router: { push: (href: unknown) => mockPush(href) } }));
jest.mock('@/hooks/use-native-tab-bottom-inset', () => ({ useNativeTabBottomInset: () => 0 }));

describe('settings navigation', () => {
  it('opens game management outside the native-tab route tree', async () => {
    const screen = await render(<SettingsScreen />);
    await fireEvent.press(screen.getByText('游戏管理'));
    expect(mockPush).toHaveBeenCalledWith('/game-management');
  });
});
