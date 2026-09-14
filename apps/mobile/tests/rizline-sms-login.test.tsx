import { act, fireEvent, render, within } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { StyleSheet, View } from 'react-native';
import { SmsLoginPanel } from '@/components/game-content/SmsLoginPanel';
import { ProviderError } from '@/providers/errors';
import type { AppLifecycleSnapshot } from '@/state/app-lifecycle';
import { createAppTheme } from '@/theme/theme-tokens';

let mockLifecycle: AppLifecycleSnapshot = { appState: 'active', phase: 'foreground-ready', foregroundReady: true, foregroundGeneration: 1, memoryWarningGeneration: 0 };
jest.mock('@/state/app-lifecycle', () => ({ useAppLifecycle: () => mockLifecycle }));
let mockTheme = createAppTheme('light', '#246BFD');
jest.mock('@/theme/app-theme', () => ({ useAppTheme: () => mockTheme }));

const validatePhone = (phone: string) => /^1\d{10}$/u.test(phone);
const sendCode = jest.fn<(_phone: string, _signal: AbortSignal) => Promise<{ retryAfterSeconds: number; confirmed?: boolean }>>();
const login = jest.fn<(_phone: string, _code: string, _signal: AbortSignal) => Promise<void>>();
const onSuccess = jest.fn();
const onBusyChange = jest.fn();
let cooldownKey = '';
const Panel = ({ visible = true }: { visible?: boolean }) => <SmsLoginPanel visible={visible} validatePhone={validatePhone}
  sendCode={sendCode} login={login} onSuccess={onSuccess} onBusyChange={onBusyChange} cooldownKey={cooldownKey} />;

beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks();
  cooldownKey = String(Math.random());
  mockLifecycle = { appState: 'active', phase: 'foreground-ready', foregroundReady: true, foregroundGeneration: 1, memoryWarningGeneration: 0 };
  mockTheme = createAppTheme('light', '#246BFD');
  sendCode.mockResolvedValue({ retryAfterSeconds: 60, confirmed: true });
  login.mockResolvedValue(undefined);
});
afterEach(() => { jest.useRealTimers(); });

test.each(['light', 'dark'] as const)('keeps the phone and code action in one themed row in %s mode', async mode => {
  mockTheme = createAppTheme(mode, '#246BFD');
  const screen = await render(<View style={{ width: 320 }}><Panel /></View>);
  const row = screen.getByTestId('sms-phone-row');
  const phone = within(row).getByLabelText('手机号');
  const send = within(row).getByRole('button', { name: '获取验证码' });
  expect(StyleSheet.flatten(row.props.style).flexDirection).toBe('row');
  expect(StyleSheet.flatten(phone.props.style)).toMatchObject({ flex: 1, minWidth: 0, color: mockTheme.text, backgroundColor: mockTheme.input, borderColor: mockTheme.border });
  expect(StyleSheet.flatten(send.props.style)).toMatchObject({ maxWidth: '44%', minHeight: 44, backgroundColor: mockTheme.accent });
  expect(phone.props.keyboardType).toBe('phone-pad');
  expect(screen.getByLabelText('验证码').props).toMatchObject({ keyboardType: 'number-pad', autoComplete: 'sms-otp', textContentType: 'oneTimeCode' });
  await screen.unmount();
});

test('validates a phone before sending and blocks repeat sends for the server cooldown', async () => {
  const screen = await render(<Panel />);
  await fireEvent.press(screen.getByLabelText('获取验证码'));
  expect(sendCode).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText('手机号'), '13800000000');
  sendCode.mockResolvedValueOnce({ retryAfterSeconds: 90, confirmed: true });
  await fireEvent.press(screen.getByLabelText('获取验证码'));
  expect(sendCode).toHaveBeenCalledTimes(1);
  expect(screen.getByText('90 秒')).toBeTruthy();
  expect(screen.getByLabelText('获取验证码').props.accessibilityValue).toEqual({ text: '90 秒后可重新获取' });
  expect(screen.queryByText('请查收验证码。')).toBeNull();
  await fireEvent.press(screen.getByLabelText('获取验证码'));
  expect(sendCode).toHaveBeenCalledTimes(1);
  await act(async () => { jest.advanceTimersByTime(90_000); });
  expect(screen.getByText('重新获取')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('获取验证码'));
  expect(sendCode).toHaveBeenCalledTimes(2);
  await screen.unmount();
});

test('retains rate limit cooldowns through close and foreground changes', async () => {
  const screen = await render(<Panel />);
  await fireEvent.changeText(screen.getByLabelText('手机号'), '13800000000');
  sendCode.mockRejectedValueOnce(new ProviderError('rate_limit', 'limited', false, { retryAfterSeconds: 180 }));
  await fireEvent.press(screen.getByLabelText('获取验证码'));
  expect(screen.getByText('180 秒')).toBeTruthy();
  expect(screen.getByText('操作太频繁，请稍后再试。')).toBeTruthy();
  await screen.rerender(<Panel visible={false} />);
  await act(async () => { jest.advanceTimersByTime(30_000); });
  await screen.rerender(<Panel />);
  expect(screen.getByLabelText('手机号').props.value).toBe('');
  expect(screen.getByText('150 秒')).toBeTruthy();
  await screen.unmount();
  const reopened = await render(<Panel />);
  expect(reopened.getByText('150 秒')).toBeTruthy();
  await reopened.unmount();
});

test('clears the code and cancels an in-flight login in the background', async () => {
  let complete: () => void = () => undefined;
  login.mockImplementationOnce(() => new Promise<void>(resolve => { complete = resolve; }));
  const screen = await render(<Panel />);
  await fireEvent.changeText(screen.getByLabelText('手机号'), '13800000000');
  await fireEvent.changeText(screen.getByLabelText('验证码'), '123456');
  await fireEvent.press(screen.getByText('登录并同步账号'));
  expect(login).toHaveBeenCalledTimes(1);
  const signal = login.mock.calls[0][2];
  mockLifecycle = { ...mockLifecycle, appState: 'background', phase: 'background', foregroundReady: false };
  await screen.rerender(<Panel />);
  expect(signal.aborted).toBe(true);
  expect(screen.getByLabelText('验证码').props.value).toBe('');
  await act(async () => { complete(); });
  expect(onSuccess).not.toHaveBeenCalled();
  expect(onBusyChange).toHaveBeenLastCalledWith(false);
  await screen.unmount();
});

test('supports a received code after an unconfirmed send and clears it after success', async () => {
  sendCode.mockResolvedValueOnce({ retryAfterSeconds: 60, confirmed: false });
  const screen = await render(<Panel />);
  await fireEvent.changeText(screen.getByLabelText('手机号'), '13800000000');
  await fireEvent.press(screen.getByLabelText('获取验证码'));
  expect(screen.queryByText('发送结果暂时无法确认；如已收到验证码，可继续登录。')).toBeNull();
  expect(screen.getByText('60 秒')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('验证码'), '123456');
  await fireEvent.press(screen.getByText('登录并同步账号'));
  expect(onSuccess).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('验证码').props.value).toBe('');
  expect(login.mock.calls[0].slice(0, 2)).toEqual(['13800000000', '123456']);
  await screen.unmount();
});

test('keeps the shared operation lock and ignores a send completed after close', async () => {
  let complete: (value: { retryAfterSeconds: number }) => void = () => undefined;
  sendCode.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  const screen = await render(<Panel />);
  await fireEvent.changeText(screen.getByLabelText('手机号'), '13800000000');
  await fireEvent.changeText(screen.getByLabelText('验证码'), '123456');
  await fireEvent.press(screen.getByLabelText('获取验证码'));
  expect(screen.getByLabelText('手机号').props.editable).toBe(false);
  await fireEvent.press(screen.getByLabelText('获取验证码'));
  await fireEvent.press(screen.getByText('登录并同步账号'));
  expect(sendCode).toHaveBeenCalledTimes(1);
  expect(login).not.toHaveBeenCalled();
  const signal = sendCode.mock.calls[0][1];
  await screen.rerender(<Panel visible={false} />);
  expect(signal.aborted).toBe(true);
  expect(screen.getByLabelText('验证码').props.value).toBe('');
  await act(async () => { complete({ retryAfterSeconds: 180 }); });
  await screen.rerender(<Panel />);
  expect(screen.getByText('60 秒')).toBeTruthy();
  expect(onBusyChange).toHaveBeenLastCalledWith(false);
  await screen.unmount();
});
