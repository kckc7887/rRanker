import { act, fireEvent, render, within } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { Animated, BackHandler, Pressable, Text, View } from 'react-native';
import { useRef } from 'react';
import { snapshotEmergencyRuntimeDiagnostics } from '@/services/runtime-diagnostics-recorder';
import {
  NotificationProvider,
  useNotification,
  useNotificationModalRequestClose,
} from '@/components/AppNotification';

const mockCancel = jest.fn(() => undefined);
const mockDelete = jest.fn(() => undefined);
const mockFirstDownloadCancel = jest.fn(() => undefined);
const mockSecondDownloadCancel = jest.fn(() => undefined);
const mockPageBack = jest.fn(() => undefined);
let hardwareBackHandler: (() => boolean) | undefined;

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, right: 0, bottom: 0, left: 0 }),
}));

function Harness() {
  const {
    dismissNotification,
    showActionNotification,
    showNotification,
    updateNotification,
  } = useNotification();
  const requestCloseNotification = useNotificationModalRequestClose();
  const progressNotificationIdRef = useRef<number | null>(null);
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
      <Pressable onPress={() => showNotification({
        title: '富文本消息',
        message: '普通内容删除线内容',
        messageSegments: [
          { text: '普通内容' },
          { text: '删除线内容', strikethrough: true },
        ],
      })}>
        <Text>显示删除线消息</Text>
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
      <Pressable onPress={() => {
        progressNotificationIdRef.current = showActionNotification({
          title: '正在准备文件',
          progress: { label: '下载进度', value: 0 },
          actions: [{ label: '取消', tone: 'cancel', onPress: mockCancel }],
        });
      }}>
        <Text>显示进度</Text>
      </Pressable>
      <Pressable onPress={() => {
        const id = progressNotificationIdRef.current;
        if (id !== null) updateNotification(id, { progress: { label: '整理进度', value: 0.64 } });
      }}>
        <Text>更新进度</Text>
      </Pressable>
      <Pressable onPress={() => {
        const id = progressNotificationIdRef.current;
        if (id !== null) dismissNotification(id);
      }}>
        <Text>关闭进度</Text>
      </Pressable>
      <Pressable onPress={() => {
        progressNotificationIdRef.current = showActionNotification({
          title: '甲谱面下载', blocking: false,
          progress: { label: '下载进度', value: 0.2 },
          actions: [{ label: '取消甲', tone: 'cancel', onPress: mockFirstDownloadCancel }],
        });
      }}><Text>下载甲谱面</Text></Pressable>
      <Pressable onPress={() => showActionNotification({
        title: '乙谱面下载', blocking: false,
        progress: { label: '下载进度', value: 0.4 },
        actions: [{ label: '取消乙', tone: 'cancel', onPress: mockSecondDownloadCancel }],
      })}><Text>下载乙谱面</Text></Pressable>
      <Pressable onPress={() => {
        if (!requestCloseNotification()) mockPageBack();
      }}><Text>返回弹层</Text></Pressable>
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
    hardwareBackHandler = undefined;
    jest.spyOn(Animated, 'parallel').mockReturnValue({
      start: (callback?: (result: { finished: boolean }) => void) => callback?.({ finished: true }),
      stop: jest.fn(),
      reset: jest.fn(),
    } as ReturnType<typeof Animated.parallel>);
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      const current = () => handler({ type: 'hardwareBackPress', timeStamp: Date.now() }) === true;
      hardwareBackHandler = current;
      return { remove: jest.fn(() => { if (hardwareBackHandler === current) hardwareBackHandler = undefined; }) };
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it.each([false, true])('通知动作异常走脱敏记录且不泄漏原始错误，返回键=%s', async (back) => {
    const initialDiagnostics = snapshotEmergencyRuntimeDiagnostics().length;
    const output = jest.spyOn(console, 'error').mockImplementation(() => {});
    (back ? mockCancel : mockDelete).mockImplementationOnce(() => { throw new Error('credential=private-test-value'); });
    const screen = await renderNotifications();
    await fireEvent.press(screen.getByText('显示确认'));
    if (back) await act(async () => { hardwareBackHandler?.(); });
    else await fireEvent.press(screen.getByText('删除'));
    expect(output).not.toHaveBeenCalled();
    const diagnostics = snapshotEmergencyRuntimeDiagnostics().slice(initialDiagnostics);
    expect(diagnostics).toHaveLength(1);
    expect(JSON.stringify(diagnostics)).not.toContain('private-test-value');
  });

  it('在安全区下方显示，并可手动关闭', async () => {
    const screen = await renderNotifications();
    await fireEvent.press(screen.getByText('显示成功'));
    expect(screen.getByText('第一条')).toBeTruthy();
    expect(screen.queryByTestId('app-notification-modal')).toBeNull();
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
    await act(async () => { hardwareBackHandler?.(); });
    expect(mockCancel).toHaveBeenCalledTimes(1);
    expect(mockDelete).not.toHaveBeenCalled();
    expect(screen.queryByText('删除本地玩家')).toBeNull();
  });

  it('公共操作弹窗显示并原位更新进度，且只保留传入的取消按钮', async () => {
    const screen = await renderNotifications();
    await fireEvent.press(screen.getByText('显示进度'));

    const card = screen.getByTestId('app-notification-card');
    expect(within(card).getByText('下载进度')).toBeTruthy();
    expect(within(card).getByText('0%')).toBeTruthy();
    expect(within(card).getAllByRole('button')).toHaveLength(1);
    expect(within(card).getByRole('button', { name: '取消' })).toBeTruthy();

    await fireEvent.press(screen.getByText('更新进度'));
    expect(within(card).getByText('整理进度')).toBeTruthy();
    expect(within(card).getByText('64%')).toBeTruthy();

    await fireEvent.press(screen.getByText('关闭进度'));
    expect(screen.queryByText('正在准备文件')).toBeNull();
  });

  it('并行进度持续显示并分别取消各自任务', async () => {
    const screen = await renderNotifications();
    await fireEvent.press(screen.getByText('下载甲谱面'));
    await fireEvent.press(screen.getByText('下载乙谱面'));
    await act(async () => jest.advanceTimersByTime(10000));
    expect(screen.getByText('甲谱面下载')).toBeTruthy();
    expect(screen.getByText('乙谱面下载')).toBeTruthy();
    expect(screen.queryByTestId('app-notification-backdrop', { includeHiddenElements: true })).toBeNull();
    await fireEvent.press(screen.getByText('取消乙'));
    expect(mockSecondDownloadCancel).toHaveBeenCalled();
    expect(mockFirstDownloadCancel).not.toHaveBeenCalled();
    expect(screen.queryByText('乙谱面下载')).toBeNull();
    expect(screen.getByText('甲谱面下载')).toBeTruthy();
    await fireEvent.press(screen.getByText('取消甲'));
    expect(mockFirstDownloadCancel).toHaveBeenCalled();
    expect(screen.queryByText('甲谱面下载')).toBeNull();
  });

  it('待选择操作优先显示并在结束后继续显示已更新的进度', async () => {
    const screen = await renderNotifications();
    await fireEvent.press(screen.getByText('下载甲谱面'));
    await fireEvent.press(screen.getByText('显示确认'));
    expect(screen.getByText('删除本地玩家')).toBeTruthy();
    expect(screen.queryByText('甲谱面下载')).toBeNull();
    await fireEvent.press(screen.getByText('更新进度'));
    await fireEvent.press(screen.getByText('取消'));
    expect(mockCancel).toHaveBeenCalled();
    expect(mockFirstDownloadCancel).not.toHaveBeenCalled();
    expect(screen.getByText('甲谱面下载')).toBeTruthy();
    expect(screen.getByText('整理进度')).toBeTruthy();
    expect(screen.getByText('64%')).toBeTruthy();
  });

  it('非阻挡进度允许页面及弹层接收返回操作', async () => {
    const screen = await renderNotifications();
    await fireEvent.press(screen.getByText('下载甲谱面'));
    await act(async () => { if (!hardwareBackHandler?.()) mockPageBack(); });
    expect(mockPageBack).toHaveBeenCalled();
    mockPageBack.mockClear();
    await fireEvent.press(screen.getByText('返回弹层'));
    expect(mockPageBack).toHaveBeenCalled();
    expect(mockFirstDownloadCancel).not.toHaveBeenCalled();
    expect(screen.getByText('甲谱面下载')).toBeTruthy();

    mockPageBack.mockClear();
    await fireEvent.press(screen.getByText('显示确认'));
    await fireEvent.press(screen.getByText('返回弹层'));
    expect(mockPageBack).not.toHaveBeenCalled();
    expect(mockCancel).toHaveBeenCalled();
    expect(screen.queryByText('删除本地玩家')).toBeNull();
    expect(screen.getByText('甲谱面下载')).toBeTruthy();
  });

  it('普通消息与持续进度并存且保持消息先后顺序和关闭动作', async () => {
    const screen = await renderNotifications();
    await fireEvent.press(screen.getByText('下载甲谱面'));
    await fireEvent.press(screen.getByText('显示成功'));
    await fireEvent.press(screen.getByText('显示警告'));
    expect(screen.getByText('甲谱面下载')).toBeTruthy();
    expect(screen.getByText('第一条')).toBeTruthy();
    expect(screen.queryByText('第二条')).toBeNull();
    await fireEvent.press(screen.getByLabelText('关闭通知'));
    expect(screen.queryByText('第一条')).toBeNull();
    expect(screen.getByText('第二条')).toBeTruthy();
    await act(async () => jest.advanceTimersByTime(5000));
    expect(screen.queryByText('第二条')).toBeNull();
    expect(screen.getByText('甲谱面下载')).toBeTruthy();
    expect(mockFirstDownloadCancel).not.toHaveBeenCalled();
  });
});
