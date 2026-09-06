import { act, fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import DiagnosticsScreen from '../app/diagnostics';
import type { RuntimeLogState } from '@/services/runtime-log-controller';

let mockState: RuntimeLogState;
const mockListeners = new Set<() => void>();
const mockStart = jest.fn(async () => undefined);
const mockStop = jest.fn();
const mockCapacity = jest.fn(async (_capacity: number) => undefined);
const mockShare = jest.fn(async (_id: number) => undefined);
const mockExport = jest.fn(async () => undefined);
const mockNotification = jest.fn();
jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));
jest.mock('@/components/AppNotification', () => ({ useNotification: () => ({ showNotification: mockNotification }) }));
jest.mock('@/services/runtime-diagnostics', () => ({ exportRuntimeDiagnostics: () => mockExport() }));
jest.mock('@/services/runtime-logs', () => ({
  initializeRuntimeLogs: async () => undefined,
  shareRuntimeLog: (id: number) => mockShare(id),
  runtimeLogs: {
    getSnapshot: () => mockState,
    subscribe: (callback: () => void) => { mockListeners.add(callback); return () => mockListeners.delete(callback); },
    start: () => mockStart(), stop: () => mockStop(), setCapacity: (capacity: number) => mockCapacity(capacity),
  },
}));

describe('diagnostics screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockState = { ready: true, busy: false, capacity: 2000, enabled: false, activeId: null, sessions: [], failed: false };
  });

  it('shows the default off switch, capacity choices, empty state and relocated export', async () => {
    const screen = await render(<DiagnosticsScreen />);
    expect(screen.getByLabelText('记录日志').props.value).toBe(false);
    expect(screen.getByLabelText('保留 2000 条').props.accessibilityState.checked).toBe(true);
    expect(screen.getByText('暂无日志，请先开启记录。')).toBeTruthy();
    expect(screen.getByText('开启后持续记录，每次启动应用会创建一份新日志，直到手动关闭。')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('保留 5000 条'));
    expect(mockCapacity).toHaveBeenCalledWith(5000);
    await fireEvent.press(screen.getByLabelText('导出诊断记录'));
    expect(mockExport).toHaveBeenCalledTimes(1);
    expect(mockShare).not.toHaveBeenCalled();
  });

  it('starts, displays updates, locks capacity, and stops without tying recording to the page mount', async () => {
    const screen = await render(<DiagnosticsScreen />);
    await fireEvent(screen.getByLabelText('记录日志'), 'valueChange', true);
    expect(mockStart).toHaveBeenCalledTimes(1);
    await act(() => {
      mockState = { ...mockState, enabled: true, activeId: 3 };
      mockListeners.forEach((listener) => listener());
    });
    expect(screen.getByLabelText('记录日志').props.value).toBe(true);
    await fireEvent.press(screen.getByLabelText('保留 1000 条'));
    expect(mockCapacity).not.toHaveBeenCalled();
    await fireEvent(screen.getByLabelText('记录日志'), 'valueChange', false);
    expect(mockStop).toHaveBeenCalledTimes(1);
    await screen.unmount();
    expect(mockStop).toHaveBeenCalledTimes(1);
  });

  it('shares the selected record and renders statuses and counts for both records', async () => {
    mockState = { ...mockState, enabled: true, activeId: 2, sessions: [
      { id: 2, startedAt: '2026-09-06T10:00:00Z', lastAt: '2026-09-06T10:01:00Z', status: 'recording', count: 20, capacity: 2000 },
      { id: 1, startedAt: '2026-09-05T10:00:00Z', lastAt: '2026-09-05T10:01:00Z', status: 'interrupted', count: 1000, capacity: 1000 },
    ] };
    const screen = await render(<DiagnosticsScreen />);
    expect(screen.getByText('记录中 · 20 / 2000 条')).toBeTruthy();
    expect(screen.getByText('已中断 · 1000 / 1000 条')).toBeTruthy();
    const shares = screen.getAllByLabelText(/^分享日志/u);
    await fireEvent.press(shares[1]!);
    expect(mockShare).toHaveBeenCalledWith(1);
    expect(mockStop).not.toHaveBeenCalled();
  });

  it('shows safe messages for export and sharing failures', async () => {
    mockState.sessions = [{ id: 1, startedAt: '2026-09-06T10:00:00Z', lastAt: '2026-09-06T10:01:00Z', status: 'stopped', count: 2, capacity: 2000 }];
    mockExport.mockRejectedValueOnce(new Error('private native error'));
    mockShare.mockRejectedValueOnce(new Error('private file path'));
    const screen = await render(<DiagnosticsScreen />);
    await fireEvent.press(screen.getByLabelText('导出诊断记录'));
    expect(mockNotification).toHaveBeenLastCalledWith(expect.objectContaining({ message: '暂时无法导出诊断记录，请稍后重试。' }));
    await fireEvent.press(screen.getByLabelText(/^分享日志/u));
    expect(mockNotification).toHaveBeenLastCalledWith(expect.objectContaining({ message: '暂时无法分享这份日志，请重试。' }));
  });

  it('offers retry after a storage failure without claiming the session crashed', async () => {
    mockState = { ...mockState, enabled: true, failed: true };
    const screen = await render(<DiagnosticsScreen />);
    expect(screen.getByText('日志保存遇到问题，请重试。')).toBeTruthy();
    expect(screen.getByLabelText('记录日志').props.value).toBe(true);
    await fireEvent.press(screen.getByLabelText('重试'));
    expect(mockStart).toHaveBeenCalledTimes(1);
  });
});
