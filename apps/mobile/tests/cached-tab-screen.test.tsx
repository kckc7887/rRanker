import { act, fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { useEffect, useState } from 'react';
import { Platform, Pressable, Text } from 'react-native';
import { create } from 'zustand';
import { CachedTabScreen, StackScreenActivityScope, useCachedTabActive, useStackScreenReady } from '@/components/CachedTabScreen';
import type { AppLifecycleSnapshot } from '@/state/app-lifecycle';

let mockLifecycle: AppLifecycleSnapshot;
let mockFocused = true;
let mockFocusEffect: (() => void | (() => void)) | null = null;
const mockEvents = new Map<string, (event: { data: { closing: boolean } }) => void>();
const mockNavigation = {
  isFocused: () => mockFocused,
  addListener: (event: string, listener: (event: { data: { closing: boolean } }) => void) => {
    mockEvents.set(event, listener);
    return () => { mockEvents.delete(event); };
  },
};
jest.mock('@/state/app-lifecycle', () => ({
  ...jest.requireActual<typeof import('@/state/app-lifecycle')>('@/state/app-lifecycle'),
  useAppLifecycle: () => mockLifecycle,
}));
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => { mockFocusEffect = effect; },
  useNavigation: () => mockNavigation,
}));
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<typeof import('@react-navigation/native')>('@react-navigation/native'),
  useIsFocused: () => mockFocused,
}));
const useAccount = create(() => ({ name: 'A' }));
const observedAccounts: string[] = [];
const activityChanges: boolean[] = [];
const originalIdle = globalThis.requestIdleCallback;
const originalCancelIdle = globalThis.cancelIdleCallback;
let idleTasks: Map<number, () => void>;
let nextIdleId = 0;

function StatefulPage() {
  const [count, setCount] = useState(0);
  const account = useAccount(state => state.name);
  const active = useCachedTabActive();
  useEffect(() => { observedAccounts.push(account); }, [account]);
  useEffect(() => { activityChanges.push(active); }, [active]);
  return <Pressable testID="increment" onPress={() => setCount(value => value + 1)}>
    <Text>页面状态 {count}</Text><Text>账号 {account}</Text><Text>{active ? '前台' : '后台'}</Text>
  </Pressable>;
}
function DeferredContent() {
  const ready = useStackScreenReady();
  return ready ? <StatefulPage /> : <Text>等待转场</Text>;
}
function StackPage({ loaded = true }: { loaded?: boolean }) {
  return <StackScreenActivityScope>{loaded ? <DeferredContent /> : <Text>加载中</Text>}</StackScreenActivityScope>;
}
async function flushIdle() {
  const tasks = [...idleTasks.values()];
  idleTasks.clear();
  await act(() => { tasks.forEach(task => task()); });
}
async function emit(event: string, closing = false) {
  await act(() => { mockEvents.get(event)?.({ data: { closing } }); });
}
beforeEach(() => {
  jest.useFakeTimers();
  mockLifecycle = { appState: 'active', phase: 'foreground-ready', foregroundReady: true,
    foregroundGeneration: 1, memoryWarningGeneration: 0 };
  mockFocused = true;
  mockFocusEffect = null;
  mockEvents.clear();
  useAccount.setState({ name: 'A' });
  observedAccounts.length = 0;
  activityChanges.length = 0;
  idleTasks = new Map();
  globalThis.requestIdleCallback = callback => {
    const id = ++nextIdleId;
    idleTasks.set(id, () => callback({ didTimeout: false, timeRemaining: () => 50 }));
    return id;
  };
  globalThis.cancelIdleCallback = id => { idleTasks.delete(id); };
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  globalThis.requestIdleCallback = originalIdle;
  globalThis.cancelIdleCallback = originalCancelIdle;
});

describe('cached native-tab content', () => {
  it('stops activity before freezing account updates and restores current data with local state', async () => {
    const view = await render(<CachedTabScreen><StatefulPage /></CachedTabScreen>);
    expect(view.getByTestId('cached-tab-placeholder')).toBeTruthy();
    let cleanup: void | (() => void);
    await act(() => { cleanup = mockFocusEffect?.(); });
    await flushIdle();
    await fireEvent.press(view.getByTestId('increment'));
    expect(view.getByText('页面状态 1')).toBeTruthy();
    mockFocused = false;
    await act(() => { cleanup?.(); });
    await view.rerender(<CachedTabScreen><StatefulPage /></CachedTabScreen>);
    expect(activityChanges.at(-1)).toBe(false);
    await act(() => { jest.runOnlyPendingTimers(); });
    await act(() => { useAccount.setState({ name: 'B' }); });
    expect(observedAccounts).toEqual(['A']);
    mockFocused = true;
    await act(() => { cleanup = mockFocusEffect?.(); });
    expect(view.getByText('账号 B')).toBeTruthy();
    expect(view.getByText('页面状态 1')).toBeTruthy();
    expect(view.getByText('后台')).toBeTruthy();
    await flushIdle();
    expect(view.getByText('前台')).toBeTruthy();
    await view.unmount();
  });

  it('cancels rapid refocus activation and freezes a page blurred again before idle', async () => {
    const view = await render(<CachedTabScreen><StatefulPage /></CachedTabScreen>);
    let cleanup: void | (() => void);
    await act(() => { cleanup = mockFocusEffect?.(); });
    await flushIdle();
    mockFocused = false;
    await act(() => { cleanup?.(); });
    await view.rerender(<CachedTabScreen><StatefulPage /></CachedTabScreen>);
    mockFocused = true;
    await act(() => { cleanup = mockFocusEffect?.(); });
    await view.rerender(<CachedTabScreen><StatefulPage /></CachedTabScreen>);
    mockFocused = false;
    await act(() => { cleanup?.(); });
    await view.rerender(<CachedTabScreen><StatefulPage /></CachedTabScreen>);
    await flushIdle();
    expect(activityChanges.at(-1)).toBe(false);
    await act(() => { jest.runOnlyPendingTimers(); });
    await act(() => { useAccount.setState({ name: 'B' }); });
    expect(observedAccounts).toEqual(['A']);
    await view.unmount();
  });

  it('preserves a focused page in background and evicts a frozen unfocused page on memory warning', async () => {
    const view = await render(<CachedTabScreen><StatefulPage /></CachedTabScreen>);
    let cleanup: void | (() => void);
    await act(() => { cleanup = mockFocusEffect?.(); });
    await flushIdle();
    await fireEvent.press(view.getByTestId('increment'));
    mockLifecycle = { ...mockLifecycle, appState: 'background', phase: 'background', foregroundReady: false, memoryWarningGeneration: 1 };
    await view.rerender(<CachedTabScreen><StatefulPage /></CachedTabScreen>);
    expect(activityChanges.at(-1)).toBe(false);
    await act(() => { jest.runOnlyPendingTimers(); });
    mockLifecycle = { ...mockLifecycle, appState: 'active', phase: 'foreground-ready', foregroundReady: true, foregroundGeneration: 2 };
    await view.rerender(<CachedTabScreen><StatefulPage /></CachedTabScreen>);
    await flushIdle();
    expect(view.getByText('页面状态 1')).toBeTruthy();
    mockFocused = false;
    await act(() => { cleanup?.(); });
    await view.rerender(<CachedTabScreen><StatefulPage /></CachedTabScreen>);
    await act(() => { jest.runOnlyPendingTimers(); });
    mockLifecycle = { ...mockLifecycle, memoryWarningGeneration: 2 };
    await view.rerender(<CachedTabScreen><StatefulPage /></CachedTabScreen>);
    expect(view.getByTestId('cached-tab-placeholder')).toBeTruthy();
    mockFocused = true;
    await act(() => { cleanup = mockFocusEffect?.(); });
    await flushIdle();
    expect(view.getByText('页面状态 0')).toBeTruthy();
    await view.unmount();
  });
});

describe('stack detail activity', () => {
  it('remembers completed appearance before data arrives and keeps state through cancelled gestures and return', async () => {
    const view = await render(<StackPage loaded={false} />);
    await emit('transitionEnd');
    await view.rerender(<StackPage />);
    expect(view.getByText('前台')).toBeTruthy();
    await fireEvent.press(view.getByTestId('increment'));
    await emit('transitionStart', true);
    expect(view.getByText('后台')).toBeTruthy();
    await emit('gestureCancel');
    expect(view.getByText('前台')).toBeTruthy();
    mockFocused = false;
    await view.rerender(<StackPage />);
    await emit('transitionStart', true);
    await emit('transitionEnd', true);
    expect(view.getByText('后台')).toBeTruthy();
    mockFocused = true;
    await view.rerender(<StackPage />);
    expect(view.getByText('页面状态 1')).toBeTruthy();
    expect(view.getByText('后台')).toBeTruthy();
    await emit('transitionEnd');
    expect(view.getByText('前台')).toBeTruthy();
    await view.unmount();
  });

  it('accepts appearance without animation start and resumes background state without another navigation event', async () => {
    const view = await render(<StackPage />);
    expect(view.getByText('等待转场')).toBeTruthy();
    await emit('transitionEnd');
    await fireEvent.press(view.getByTestId('increment'));
    mockLifecycle = { ...mockLifecycle, appState: 'background', phase: 'background', foregroundReady: false };
    await view.rerender(<StackPage />);
    expect(view.getByText('后台')).toBeTruthy();
    mockLifecycle = { ...mockLifecycle, appState: 'active', phase: 'foreground-ready', foregroundReady: true };
    await view.rerender(<StackPage />);
    expect(view.getByText('页面状态 1')).toBeTruthy();
    expect(view.getByText('前台')).toBeTruthy();
    await view.unmount();
  });

  it('uses cancellable idle readiness on web without native transition events', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    const view = await render(<StackPage />);
    mockFocused = false;
    await view.rerender(<StackPage />);
    await flushIdle();
    expect(view.getByText('等待转场')).toBeTruthy();
    mockFocused = true;
    await view.rerender(<StackPage />);
    await flushIdle();
    expect(view.getByText('前台')).toBeTruthy();
    mockFocused = false;
    await view.rerender(<StackPage />);
    mockFocused = true;
    await view.rerender(<StackPage />);
    expect(view.getByText('后台')).toBeTruthy();
    await flushIdle();
    expect(view.getByText('前台')).toBeTruthy();
    await view.unmount();
  });
});
