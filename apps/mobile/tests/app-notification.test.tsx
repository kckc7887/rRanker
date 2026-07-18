import { act, fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { Animated, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  NotificationProvider,
  useNotification,
} from '@/components/AppNotification';

const mockCancel = jest.fn(() => undefined);
const mockDelete = jest.fn(() => undefined);
let mockHardwareBack: (() => boolean | null | undefined) | undefined;

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, right: 0, bottom: 0, left: 0 }),
}));

function Harness() {
  const { showActionNotification, showNotification } = useNotification();
  return (
    <View>
      <Pressable onPress={() => showNotification({ title: '第一条', variant: 'success' })}>
        <Text>显示成功</Text>
      </Pressable>
      <Pressable onPress={() => showNotification({ title: '第二条', variant: 'warning' })}>
        <Text>显示警告</Text>
      </Pressable>
      <Pressable onPress={() => showNotification({ title: '失败消息', variant: 'error' })}>
        <Text>显示错误</Text>
      </Pressable>
      <Pressable onPress={() => showNotification({ title: '持续消息', duration: null })}>
        <Text>显示持续消息</Text>
      </Pressable>
      <Pressable onPress={() => showActionNotification({
        title: '删除本地玩家',
        message: '删除后无法恢复。',
        variant: 'warning',
        actions: [
          { label: '取消', tone: 'cancel', onPress: mockCancel },
          { label: '删除', tone: 'destructive', onPress: mockDelete },
        ],
      })}>
        <Text>显示确认</Text>
      </Pressable>
    </View>
  );
}

function renderNotifications() {
  return render(
    <NotificationProvider>
      <Harness />
    </NotificationProvider>,
  );
}

describe('全局顶部通知', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockHardwareBack = undefined;
    jest.spyOn(Animated, 'parallel').mockReturnValue({
      start: (callback?: (result: { finished: boolean }) => void) => callback?.({ finished: true }),
      stop: jest.fn(),
      reset: jest.fn(),
    } as ReturnType<typeof Animated.parallel>);
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      mockHardwareBack = handler;
      return { remove: jest.fn() };
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('在安全区下方显示，并可手动关闭', async () => {
    const screen = await renderNotifications();
    await fireEvent.press(screen.getByText('显示成功'));
    expect(screen.getByText('第一条')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('app-notification-overlay').props.style))
      .toMatchObject({ paddingTop: 32 });
    await fireEvent.press(screen.getByLabelText('关闭通知'));
    expect(screen.queryByText('第一条')).toBeNull();
  });

  it('成功消息三秒消失，并按先进先出展示五秒警告消息', async () => {
    const screen = await renderNotifications();
    await fireEvent.press(screen.getByText('显示成功'));
    await fireEvent.press(screen.getByText('显示警告'));
    expect(screen.getByText('第一条')).toBeTruthy();
    expect(screen.queryByText('第二条')).toBeNull();

    await act(async () => jest.advanceTimersByTime(2999));
    expect(screen.getByText('第一条')).toBeTruthy();
    await act(async () => jest.advanceTimersByTime(1));
    expect(screen.queryByText('第一条')).toBeNull();
    expect(screen.getByText('第二条')).toBeTruthy();

    await act(async () => jest.advanceTimersByTime(4999));
    expect(screen.getByText('第二条')).toBeTruthy();
    await act(async () => jest.advanceTimersByTime(1));
    expect(screen.queryByText('第二条')).toBeNull();
  });

  it('错误消息使用五秒时长，显式持续消息不会自动关闭', async () => {
    const screen = await renderNotifications();
    await fireEvent.press(screen.getByText('显示错误'));
    await act(async () => jest.advanceTimersByTime(3000));
    expect(screen.getByText('失败消息')).toBeTruthy();
    await act(async () => jest.advanceTimersByTime(2000));
    expect(screen.queryByText('失败消息')).toBeNull();

    await fireEvent.press(screen.getByText('显示持续消息'));
    await act(async () => jest.advanceTimersByTime(10000));
    expect(screen.getByText('持续消息')).toBeTruthy();
  });

  it('确认卡阻断背景、保持显示，并只执行一次危险操作', async () => {
    const screen = await renderNotifications();
    await fireEvent.press(screen.getByText('显示确认'));
    expect(screen.getByTestId('app-notification-backdrop', { includeHiddenElements: true })).toBeTruthy();
    await act(async () => jest.advanceTimersByTime(10000));
    expect(screen.getByText('删除本地玩家')).toBeTruthy();

    const deleteButton = screen.getByText('删除');
    await fireEvent.press(deleteButton);
    await fireEvent.press(deleteButton);
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('删除本地玩家')).toBeNull();
  });

  it('Android 返回键执行取消操作', async () => {
    const screen = await renderNotifications();
    await fireEvent.press(screen.getByText('显示确认'));
    let handled: boolean | null | undefined;
    await act(async () => { handled = mockHardwareBack?.(); });
    expect(handled).toBe(true);
    expect(mockCancel).toHaveBeenCalledTimes(1);
    expect(mockDelete).not.toHaveBeenCalled();
    expect(screen.queryByText('删除本地玩家')).toBeNull();
  });
});
