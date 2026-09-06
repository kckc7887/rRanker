import { act, fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { StyleSheet } from 'react-native';
import DiagnosticsScreen from '../app/diagnostics';
import type { RuntimeLogState } from '@/services/runtime-log-controller';
import type { RuntimeLogStatus } from '@/domain/runtime-log';
import { createAppTheme } from '@/theme/theme-tokens';

let mockState: RuntimeLogState;
let mockTheme = createAppTheme('light', '#246BFD');
const mockListeners = new Set<() => void>();
const mockStart = jest.fn(async () => undefined);
const mockStop = jest.fn(async () => undefined);
const mockInitialize = jest.fn(async () => undefined);
const mockCapacity = jest.fn(async (_capacity: number) => undefined);
const mockShare = jest.fn(async (_id: number) => undefined);
const mockExport = jest.fn(async () => undefined);
const mockNotification = jest.fn();
jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));
jest.mock('@/theme/app-theme', () => ({ useAppTheme: () => mockTheme }));
jest.mock('@/components/AppNotification', () => ({ useNotification: () => ({ showNotification: mockNotification }) }));
jest.mock('@/components/game-content/DetailPressable', () => {
  const RN = jest.requireActual('react-native') as typeof import('react-native');
  return { DetailPressable: RN.Pressable, DetailGestureRoot: RN.View };
});
jest.mock('@/services/runtime-diagnostics', () => ({ exportRuntimeDiagnostics: () => mockExport() }));
jest.mock('@/services/runtime-logs', () => ({
  initializeRuntimeLogs: () => mockInitialize(),
  shareRuntimeLog: (id: number) => mockShare(id),
  runtimeLogs: {
    getSnapshot: () => mockState,
    subscribe: (callback: () => void) => { mockListeners.add(callback); return () => mockListeners.delete(callback); },
    start: () => mockStart(), stop: () => mockStop(), setCapacity: (capacity: number) => mockCapacity(capacity),
  },
}));

function session(id: number, status: RuntimeLogStatus) {
  return { id, startedAt: '2026-09-06T10:00:01', lastAt: '2026-09-06T10:01:23', status, count: 20, capacity: 2000 as const };
}

describe('diagnostics screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTheme = createAppTheme('light', '#246BFD');
    mockState = { ready: true, busy: false, capacity: 2000, enabled: false, activeId: null, sessions: [], failed: false };
  });

  it('shows the off state and capacity choices, with diagnostic sharing only in the empty state', async () => {
    const screen = await render(<DiagnosticsScreen />);
    expect(screen.getByLabelText('记录日志').props.value).toBe(false);
    expect(screen.getByText('未开启')).toBeTruthy();
    expect(screen.getByLabelText('保留 2000 条').props.accessibilityState.checked).toBe(true);
    expect(screen.getByText('还没有日志')).toBeTruthy();
    expect(screen.queryByText('导出诊断记录')).toBeNull();
    await fireEvent.press(screen.getByLabelText('保留 5000 条'));
    expect(mockCapacity).toHaveBeenCalledWith(5000);
    await fireEvent.press(screen.getByLabelText('分享诊断信息'));
    expect(mockExport).toHaveBeenCalledTimes(1);
    expect(mockShare).not.toHaveBeenCalled();
  });

  it.each(['light', 'dark'] as const)('uses the personalization switch colors with a custom accent in %s mode', async (mode) => {
    mockTheme = createAppTheme(mode, '#A63BC1');
    const screen = await render(<DiagnosticsScreen />);
    expect(screen.getByLabelText('记录日志').props.tintColor).toBe(mockTheme.border);
    expect(screen.getByLabelText('记录日志').props.onTintColor).toBe(mockTheme.accentSoft);
    expect(screen.getByLabelText('记录日志').props.thumbTintColor).toBe(mockTheme.surface);
    await act(() => {
      mockState = { ...mockState, enabled: true };
      mockListeners.forEach((listener) => listener());
    });
    expect(screen.getByLabelText('记录日志').props.thumbTintColor).toBe(mockTheme.accent);
    expect(screen.queryByText('正在记录')).toBeNull();
  });

  it('starts, displays updates, locks capacity, and stops without tying recording to page mounting', async () => {
    const screen = await render(<DiagnosticsScreen />);
    await fireEvent(screen.getByLabelText('记录日志'), 'valueChange', true);
    expect(mockStart).toHaveBeenCalledTimes(1);
    await act(() => {
      mockState = { ...mockState, enabled: true, activeId: 3, sessions: [session(3, 'recording')] };
      mockListeners.forEach((listener) => listener());
    });
    expect(screen.getByLabelText('记录日志').props.value).toBe(true);
    expect(screen.getAllByText('正在记录')).toHaveLength(2);
    expect(screen.getByText('关闭记录后可调整')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('保留 1000 条'));
    expect(mockCapacity).not.toHaveBeenCalled();
    await fireEvent(screen.getByLabelText('记录日志'), 'valueChange', false);
    expect(mockStop).toHaveBeenCalledTimes(1);
    await screen.unmount();
    expect(mockStop).toHaveBeenCalledTimes(1);
  });

  it('keeps creation order despite clock changes and shares the selected record with clear time and count labels', async () => {
    mockState = { ...mockState, enabled: true, activeId: 2, sessions: [
      session(2, 'recording'),
      { ...session(1, 'interrupted'), startedAt: '2026-09-07T10:00:01', count: 1000, capacity: 1000 },
    ] };
    const screen = await render(<DiagnosticsScreen />);
    expect(screen.getByText('最新记录')).toBeTruthy();
    expect(screen.getByText('上次记录')).toBeTruthy();
    expect(screen.getByText('2026/09/06 10:00:01')).toBeTruthy();
    expect(screen.getAllByText('2026/09/06 10:01:23')).toHaveLength(2);
    expect(screen.getByText('已保留 20 条 · 上限 2000 条')).toBeTruthy();
    expect(screen.getByText('已保留 1000 条 · 上限 1000 条')).toBeTruthy();
    expect(screen.queryByLabelText('分享诊断信息')).toBeNull();
    expect(screen.queryByText('导出诊断记录')).toBeNull();
    const shares = screen.getAllByLabelText(/^分享日志/u);
    expect(shares[0]!.props.accessibilityLabel).toContain('最新记录');
    await fireEvent.press(shares[0]!);
    await fireEvent.press(shares[1]!);
    expect(mockShare.mock.calls).toEqual([[2], [1]]);
    expect(mockStop).not.toHaveBeenCalled();
  });

  it.each([
    ['recording', '正在记录', 'accent'],
    ['stopped', '已结束', 'textSecondary'],
    ['interrupted', '已中断', 'warning'],
    ['failed', '保存失败', 'danger'],
  ] as const)('renders the %s status with a text badge and semantic color', async (status, label, color) => {
    mockState.sessions = [session(1, status)];
    const screen = await render(<DiagnosticsScreen />);
    expect(StyleSheet.flatten(screen.getByText(label).props.style).color).toBe(mockTheme[color]);
    expect(screen.queryByText(/崩溃/u)).toBeNull();
  });

  it.each([
    { ready: false, busy: true, failed: false },
    { ready: false, busy: false, failed: true },
    { ready: true, busy: true, failed: false },
    { ready: true, busy: false, failed: true },
  ])('does not show an empty state during loading or failure: %j', async (state) => {
    mockState = { ...mockState, ...state };
    const screen = await render(<DiagnosticsScreen />);
    expect(screen.queryByText('还没有日志')).toBeNull();
    expect(screen.queryByLabelText('分享诊断信息')).toBeNull();
    if (state.busy) expect(screen.getByText('准备中')).toBeTruthy();
    if (!state.ready && state.failed) {
      expect(screen.getByText('暂时无法读取日志，请重试。')).toBeTruthy();
      await fireEvent.press(screen.getByLabelText('重试'));
      expect(mockInitialize).toHaveBeenCalledTimes(2);
      expect(mockStart).not.toHaveBeenCalled();
    }
  });

  it('offers retry after a storage failure while keeping the enabled preference and saved log visible', async () => {
    mockState = { ...mockState, enabled: true, failed: true, sessions: [session(1, 'failed')] };
    const screen = await render(<DiagnosticsScreen />);
    expect(screen.getByText('日志保存遇到问题，请重试。')).toBeTruthy();
    expect(screen.getByLabelText('记录日志').props.value).toBe(true);
    expect(screen.queryByText('正在记录')).toBeNull();
    expect(screen.getAllByText('保存失败')).toHaveLength(2);
    await fireEvent.press(screen.getByLabelText('重试'));
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it('shows safe messages for diagnostic and log sharing failures', async () => {
    mockExport.mockRejectedValueOnce(new Error('private native error'));
    mockShare.mockRejectedValueOnce(new Error('private file path'));
    const screen = await render(<DiagnosticsScreen />);
    await fireEvent.press(screen.getByLabelText('分享诊断信息'));
    expect(mockNotification).toHaveBeenLastCalledWith(expect.objectContaining({ message: '暂时无法分享诊断信息，请稍后重试。' }));
    await act(() => {
      mockState = { ...mockState, sessions: [session(1, 'stopped')] };
      mockListeners.forEach((listener) => listener());
    });
    await fireEvent.press(screen.getByLabelText(/^分享日志/u));
    expect(mockNotification).toHaveBeenLastCalledWith(expect.objectContaining({ message: '暂时无法分享这份日志，请重试。' }));
  });

  it('disables controls and duplicate shares until sharing completes', async () => {
    mockState.sessions = [session(1, 'stopped')];
    let complete = () => {};
    mockShare.mockImplementationOnce(() => new Promise<undefined>((resolve) => { complete = () => resolve(undefined); }));
    const screen = await render(<DiagnosticsScreen />);
    await fireEvent.press(screen.getByLabelText(/^分享日志/u));
    expect(screen.getByLabelText(/^分享日志/u).props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    expect(screen.getByLabelText('记录日志').props.disabled).toBe(true);
    await fireEvent.press(screen.getByLabelText(/^分享日志/u));
    expect(mockShare).toHaveBeenCalledTimes(1);
    await act(() => complete());
    expect(screen.getByLabelText(/^分享日志/u).props.accessibilityState.disabled).toBe(false);
  });
});
