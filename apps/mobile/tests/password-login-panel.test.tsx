import { fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { PasswordLoginPanel } from '@/components/game-content/PasswordLoginPanel';
import type { AppLifecycleSnapshot } from '@/state/app-lifecycle';
import { createAppTheme } from '@/theme/theme-tokens';

let mockLifecycle: AppLifecycleSnapshot = { appState: 'active', phase: 'foreground-ready', foregroundReady: true, foregroundGeneration: 1, memoryWarningGeneration: 0 };
jest.mock('@/state/app-lifecycle', () => ({ useAppLifecycle: () => mockLifecycle }));
let mockTheme = createAppTheme('light', '#246BFD');
jest.mock('@/theme/app-theme', () => ({ useAppTheme: () => mockTheme }));

const login = jest.fn<(credentials: { username: string; password: string }, signal: AbortSignal) => Promise<void>>();

beforeEach(() => {
  jest.clearAllMocks();
  mockLifecycle = { appState: 'active', phase: 'foreground-ready', foregroundReady: true, foregroundGeneration: 1, memoryWarningGeneration: 0 };
  mockTheme = createAppTheme('light', '#246BFD');
  login.mockResolvedValue(undefined);
});

test('keeps the Majdata username labels and submit copy by default', async () => {
  const screen = await render(<PasswordLoginPanel visible onSuccess={jest.fn()} onBusyChange={jest.fn()} login={login} />);
  expect(screen.getByLabelText('用户名')).toBeTruthy();
  expect(screen.getByText('账密登录并验证')).toBeTruthy();
  await fireEvent.press(screen.getByText('账密登录并验证'));
  expect(screen.getByText('请输入用户名和密码')).toBeTruthy();
  expect(login).not.toHaveBeenCalled();
  await screen.unmount();
});

test('accepts an optional phone identity without changing the submit action', async () => {
  const screen = await render(<PasswordLoginPanel visible onSuccess={jest.fn()} onBusyChange={jest.fn()} login={login}
    usernameLabel="手机号" usernameKeyboardType="phone-pad" validateUsername={value => /^1\d{10}$/u.test(value)}
    emptyMessage="请输入手机号和密码" invalidUsernameMessage="请输入正确的手机号" />);
  expect(screen.getByLabelText('手机号').props.keyboardType).toBe('phone-pad');
  await fireEvent.changeText(screen.getByLabelText('手机号'), '123');
  await fireEvent.changeText(screen.getByLabelText('密码'), 'secret');
  await fireEvent.press(screen.getByText('账密登录并验证'));
  expect(screen.getByText('请输入正确的手机号')).toBeTruthy();
  expect(login).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText('手机号'), '13800000000');
  await fireEvent.press(screen.getByText('账密登录并验证'));
  expect(login).toHaveBeenCalledWith({ username: '13800000000', password: 'secret' }, expect.any(AbortSignal));
  await screen.unmount();
});
