import { act, fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { SmsLoginPanel } from '@/components/game-content/SmsLoginPanel';
import { ProviderError } from '@/providers/errors';
import type { AppLifecycleSnapshot } from '@/state/app-lifecycle';

let mockLifecycle: AppLifecycleSnapshot = { appState: 'active', phase: 'foreground-ready', foregroundReady: true, foregroundGeneration: 1, memoryWarningGeneration: 0 };
jest.mock('@/state/app-lifecycle', () => ({ useAppLifecycle: () => mockLifecycle }));

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
  sendCode.mockResolvedValue({ retryAfterSeconds: 60, confirmed: true });
  login.mockResolvedValue(undefined);
});
afterEach(() => { jest.useRealTimers(); });

test('validates a phone before sending and blocks repeat sends for the server cooldown', async () => {
  const screen = await render(<Panel />);
  await fireEvent.press(screen.getByLabelText('获取验证码'));
  expect(sendCode).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText('手机号'), '13800000000');
  sendCode.mockResolvedValueOnce({ retryAfterSeconds: 90, confirmed: true });
  await fireEvent.press(screen.getByLabelText('获取验证码'));
  expect(sendCode).toHaveBeenCalledTimes(1);
  expect(screen.getByText('90 秒后可重新获取')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('获取验证码'));
  expect(sendCode).toHaveBeenCalledTimes(1);
  await act(async () => { jest.advanceTimersByTime(90_000); });
  await fireEvent.press(screen.getByLabelText('获取验证码'));
  expect(sendCode).toHaveBeenCalledTimes(2);
  await screen.unmount();
});

test('retains rate limit cooldowns through close and foreground changes', async () => {
  const screen = await render(<Panel />);
  await fireEvent.changeText(screen.getByLabelText('手机号'), '13800000000');
  sendCode.mockRejectedValueOnce(new ProviderError('rate_limit', 'limited', false, { retryAfterSeconds: 180 }));
  await fireEvent.press(screen.getByLabelText('获取验证码'));
  expect(screen.getByText('180 秒后可重新获取')).toBeTruthy();
  await screen.rerender(<Panel visible={false} />);
  await act(async () => { jest.advanceTimersByTime(30_000); });
  await screen.rerender(<Panel />);
  expect(screen.getByLabelText('手机号').props.value).toBe('');
  expect(screen.getByText('150 秒后可重新获取')).toBeTruthy();
  await screen.unmount();
  const reopened = await render(<Panel />);
  expect(reopened.getByText('150 秒后可重新获取')).toBeTruthy();
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
  expect(screen.getByText('发送结果暂时无法确认；如已收到验证码，可继续登录。')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('验证码'), '123456');
  await fireEvent.press(screen.getByText('登录并同步账号'));
  expect(onSuccess).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('验证码').props.value).toBe('');
  expect(login.mock.calls[0].slice(0, 2)).toEqual(['13800000000', '123456']);
  await screen.unmount();
});
