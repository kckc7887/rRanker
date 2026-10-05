import { act, fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { useState } from 'react';
import { InteractionManager, Pressable, Text } from 'react-native';
import { CachedTabScreen, useCachedTabActive } from '@/components/CachedTabScreen';
import type { AppLifecycleSnapshot } from '@/state/app-lifecycle';

let mockLifecycle: AppLifecycleSnapshot = {
  appState: 'active',
  phase: 'foreground-ready',
  foregroundReady: true,
  foregroundGeneration: 1,
  memoryWarningGeneration: 0,
};

jest.mock('@/state/app-lifecycle', () => ({
  useAppLifecycle: () => mockLifecycle,
}));

let mockFocusEffect: (() => void | (() => void)) | null = null;

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => { mockFocusEffect = effect; },
}));

function ActivityLabel() {
  const active = useCachedTabActive();
  return <Text>{active ? '前台' : '后台'}</Text>;
}

function StatefulHeavyPage() {
  const [count, setCount] = useState(0);
  return <Pressable accessibilityLabel="修改页面状态" onPress={() => setCount((value) => value + 1)}>
    <Text>页面状态 {count}</Text>
    <ActivityLabel />
  </Pressable>;
}

describe('cached native-tab content', () => {
  beforeEach(() => {
    mockLifecycle = {
      appState: 'active', phase: 'foreground-ready', foregroundReady: true,
      foregroundGeneration: 1, memoryWarningGeneration: 0,
    };
  });
  afterEach(() => jest.restoreAllMocks());

  it('keeps mounted state and resumes activity only after every focus transition', async () => {
    const pendingTasks: { callback: () => void; cancel: jest.Mock }[] = [];
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((callback) => {
      const task = {
        callback: callback as () => void,
        cancel: jest.fn(),
      };
      pendingTasks.push(task);
      return { cancel: task.cancel } as unknown as ReturnType<typeof InteractionManager.runAfterInteractions>;
    });

    const screen = await render(<CachedTabScreen><StatefulHeavyPage /></CachedTabScreen>);
    expect(screen.getByTestId('cached-tab-placeholder')).toBeTruthy();

    let cleanup: void | (() => void);
    await act(() => { cleanup = mockFocusEffect?.(); });
    expect(screen.queryByText('前台')).toBeNull();
    await act(() => { pendingTasks[0]?.callback(); });
    await fireEvent.press(screen.getByLabelText('修改页面状态'));
    expect(screen.getByText('页面状态 1')).toBeTruthy();
    expect(screen.getByText('前台')).toBeTruthy();

    await act(() => { cleanup?.(); });
    expect(pendingTasks[0]?.cancel).toHaveBeenCalled();
    expect(screen.getByText('页面状态 1')).toBeTruthy();
    expect(screen.getByText('后台')).toBeTruthy();

    let secondCleanup: void | (() => void);
    await act(() => { secondCleanup = mockFocusEffect?.(); });
    expect(screen.queryByText('前台')).toBeNull();
    expect(screen.getByText('后台')).toBeTruthy();
    expect(screen.getByText('页面状态 1')).toBeTruthy();

    await act(() => { secondCleanup?.(); });
    expect(pendingTasks[1]?.cancel).toHaveBeenCalled();
    expect(screen.queryByText('前台')).toBeNull();
    expect(screen.getByText('页面状态 1')).toBeTruthy();

    let thirdCleanup: void | (() => void);
    await act(() => { thirdCleanup = mockFocusEffect?.(); });
    await act(() => { pendingTasks[2]?.callback(); });
    expect(screen.getByText('前台')).toBeTruthy();
    expect(screen.getByText('页面状态 1')).toBeTruthy();

    await act(() => { thirdCleanup?.(); });
    expect(pendingTasks[2]?.cancel).toHaveBeenCalled();
  });

  it('keeps the focused page mounted in background and cancels a superseded resume task', async () => {
    const pendingTasks: { callback: () => void; cancel: jest.Mock }[] = [];
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((callback) => {
      const task = { callback: callback as () => void, cancel: jest.fn() };
      pendingTasks.push(task);
      return { cancel: task.cancel } as unknown as ReturnType<typeof InteractionManager.runAfterInteractions>;
    });

    const screen = await render(<CachedTabScreen><StatefulHeavyPage /></CachedTabScreen>);
    await act(() => { mockFocusEffect?.(); });
    await act(() => { pendingTasks[0]?.callback(); });
    expect(screen.getByText('前台')).toBeTruthy();

    mockLifecycle = {
      ...mockLifecycle, appState: 'background', phase: 'background', foregroundReady: false,
    };
    await screen.rerender(<CachedTabScreen><StatefulHeavyPage /></CachedTabScreen>);
    expect(screen.getByText('后台')).toBeTruthy();
    expect(screen.getByText('页面状态 0')).toBeTruthy();
    expect(screen.queryByTestId('cached-tab-placeholder')).toBeNull();
    mockLifecycle = {
      ...mockLifecycle, appState: 'active', phase: 'foreground-ready', foregroundReady: true,
      foregroundGeneration: 2,
    };
    await screen.rerender(<CachedTabScreen><StatefulHeavyPage /></CachedTabScreen>);
    expect(screen.getByText('后台')).toBeTruthy();
    expect(screen.queryByTestId('cached-tab-placeholder')).toBeNull();

    mockLifecycle = {
      ...mockLifecycle, appState: 'background', phase: 'background', foregroundReady: false,
    };
    await screen.rerender(<CachedTabScreen><StatefulHeavyPage /></CachedTabScreen>);
    expect(pendingTasks[1]?.cancel).toHaveBeenCalled();
    await act(() => { pendingTasks[1]?.callback(); });
    expect(screen.getByText('后台')).toBeTruthy();
    expect(screen.queryByTestId('cached-tab-placeholder')).toBeNull();
  });

  it('evicts only an unfocused page after a memory warning', async () => {
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((callback) => {
      (callback as () => void)();
      return { cancel: jest.fn() } as unknown as ReturnType<typeof InteractionManager.runAfterInteractions>;
    });
    const screen = await render(<CachedTabScreen><StatefulHeavyPage /></CachedTabScreen>);
    let cleanup: void | (() => void);
    await act(() => { cleanup = mockFocusEffect?.(); });
    expect(screen.getByText('前台')).toBeTruthy();

    mockLifecycle = { ...mockLifecycle, memoryWarningGeneration: 1 };
    await screen.rerender(<CachedTabScreen><StatefulHeavyPage /></CachedTabScreen>);
    expect(screen.getByText('前台')).toBeTruthy();

    await act(() => { cleanup?.(); });
    mockLifecycle = { ...mockLifecycle, memoryWarningGeneration: 2 };
    await screen.rerender(<CachedTabScreen><StatefulHeavyPage /></CachedTabScreen>);
    expect(screen.getByTestId('cached-tab-placeholder')).toBeTruthy();
  });
});
