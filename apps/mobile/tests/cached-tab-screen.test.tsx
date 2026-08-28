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
const mockHeavyPageRender = jest.fn();

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => { mockFocusEffect = effect; },
}));

function ActivityLabel() {
  const active = useCachedTabActive();
  return <Text>{active ? '前台' : '后台'}</Text>;
}

function StatefulHeavyPage() {
  mockHeavyPageRender();
  const [count, setCount] = useState(0);
  return <Pressable accessibilityLabel="修改页面状态" onPress={() => setCount((value) => value + 1)}>
    <Text>页面状态 {count}</Text>
    <ActivityLabel />
  </Pressable>;
}

describe('cached native-tab content', () => {
  beforeEach(() => {
    mockHeavyPageRender.mockClear();
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
    expect(pendingTasks).toHaveLength(1);
    expect(screen.queryByText('前台')).toBeNull();
    await act(() => { pendingTasks[0]?.callback(); });
    await fireEvent.press(screen.getByLabelText('修改页面状态'));
    expect(screen.getByText('页面状态 1')).toBeTruthy();
    expect(screen.getByText('前台')).toBeTruthy();
    const rendersAfterStateChange = mockHeavyPageRender.mock.calls.length;

    await act(() => { cleanup?.(); });
    expect(pendingTasks[0]?.cancel).toHaveBeenCalledTimes(1);
    expect(screen.getByText('页面状态 1')).toBeTruthy();
    expect(screen.getByText('后台')).toBeTruthy();

    let secondCleanup: void | (() => void);
    await act(() => { secondCleanup = mockFocusEffect?.(); });
    expect(pendingTasks).toHaveLength(2);
    expect(screen.getByText('页面状态 1')).toBeTruthy();
    expect(screen.getByText('后台')).toBeTruthy();
    expect(mockHeavyPageRender).toHaveBeenCalledTimes(rendersAfterStateChange);

    await act(() => { secondCleanup?.(); });
    expect(pendingTasks[1]?.cancel).toHaveBeenCalledTimes(1);
    expect(screen.getByText('后台')).toBeTruthy();
    expect(mockHeavyPageRender).toHaveBeenCalledTimes(rendersAfterStateChange);

    let thirdCleanup: void | (() => void);
    await act(() => { thirdCleanup = mockFocusEffect?.(); });
    expect(pendingTasks).toHaveLength(3);
    await act(() => { pendingTasks[2]?.callback(); });
    expect(screen.getByText('前台')).toBeTruthy();
    expect(screen.getByText('页面状态 1')).toBeTruthy();
    expect(mockHeavyPageRender).toHaveBeenCalledTimes(rendersAfterStateChange);

    await act(() => { thirdCleanup?.(); });
    expect(pendingTasks[2]?.cancel).toHaveBeenCalledTimes(1);
  });

  it('unmounts in background and cancels a superseded resume task', async () => {
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
    expect(screen.getByTestId('cached-tab-placeholder')).toBeTruthy();
    mockLifecycle = {
      ...mockLifecycle, appState: 'active', phase: 'foreground-ready', foregroundReady: true,
      foregroundGeneration: 2,
    };
    await screen.rerender(<CachedTabScreen><StatefulHeavyPage /></CachedTabScreen>);
    expect(pendingTasks).toHaveLength(2);
    expect(screen.getByTestId('cached-tab-placeholder')).toBeTruthy();

    mockLifecycle = {
      ...mockLifecycle, appState: 'background', phase: 'background', foregroundReady: false,
    };
    await screen.rerender(<CachedTabScreen><StatefulHeavyPage /></CachedTabScreen>);
    expect(pendingTasks[1]?.cancel).toHaveBeenCalledTimes(1);
    await act(() => { pendingTasks[1]?.callback(); });
    expect(screen.getByTestId('cached-tab-placeholder')).toBeTruthy();
  });
});
