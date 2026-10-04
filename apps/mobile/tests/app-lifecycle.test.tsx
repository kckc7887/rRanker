import { act, render, screen } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { AppState, InteractionManager, Text } from 'react-native';
import {
  AppLifecycleProvider,
  getForegroundAbortSignal,
  useAppLifecycle,
} from '@/state/app-lifecycle';

function LifecycleProbe() {
  const lifecycle = useAppLifecycle();
  return <Text>{lifecycle.phase}</Text>;
}

describe('AppLifecycleProvider', () => {
  afterEach(() => jest.restoreAllMocks());

  it('cancels an expired foreground recovery and releases native listeners', async () => {
    let changeListener: ((state: 'active' | 'inactive' | 'background') => void) | null = null;
    let memoryWarningListener: (() => void) | null = null;
    const removers = [jest.fn(), jest.fn()];
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((type: string, listener: unknown) => {
      if (type === 'change') changeListener = listener as typeof changeListener;
      if (type === 'memoryWarning') memoryWarningListener = listener as typeof memoryWarningListener;
      return { remove: type === 'change' ? removers[0] : removers[1] };
    }) as typeof AppState.addEventListener);

    const tasks: { callback: () => void; cancel: jest.Mock }[] = [];
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((callback) => {
      const task = { callback: callback as () => void, cancel: jest.fn() };
      tasks.push(task);
      return { cancel: task.cancel } as unknown as ReturnType<typeof InteractionManager.runAfterInteractions>;
    });

    const view = await render(<AppLifecycleProvider><LifecycleProbe /></AppLifecycleProvider>);
    expect(screen.getByText('foreground-waiting')).toBeTruthy();

    await act(() => { tasks[0]?.callback(); });
    expect(screen.getByText('foreground-ready')).toBeTruthy();
    const firstSignal = getForegroundAbortSignal();
    expect(firstSignal.aborted).toBe(false);

    await act(() => { changeListener?.('inactive'); });
    expect(firstSignal.aborted).toBe(false);
    expect(screen.getByText('inactive')).toBeTruthy();

    await act(() => { changeListener?.('active'); });
    await act(() => { tasks.at(-1)?.callback(); });
    expect(screen.getByText('foreground-ready')).toBeTruthy();
    expect(getForegroundAbortSignal()).toBe(firstSignal);

    await act(() => { changeListener?.('background'); });
    expect(firstSignal.aborted).toBe(true);
    expect(screen.getByText('background')).toBeTruthy();
    await act(() => { changeListener?.('active'); });
    const expiredTask = tasks.at(-1)!;
    await act(() => { changeListener?.('background'); });
    expect(expiredTask.cancel).toHaveBeenCalled();
    await act(() => { expiredTask.callback(); });
    expect(screen.getByText('background')).toBeTruthy();

    await act(() => { changeListener?.('active'); });
    await act(() => { tasks.at(-1)?.callback(); });
    expect(screen.getByText('foreground-ready')).toBeTruthy();
    expect(getForegroundAbortSignal()).not.toBe(firstSignal);
    const restoredSignal = getForegroundAbortSignal();
    await act(() => { expiredTask.callback(); });
    expect(getForegroundAbortSignal()).toBe(restoredSignal);

    await act(() => { memoryWarningListener?.(); });
    expect(screen.getByText('foreground-ready')).toBeTruthy();

    await view.unmount();
    expect(removers[0]).toHaveBeenCalled();
    expect(removers[1]).toHaveBeenCalled();
  });

  it('restores a live abort signal after background via inactive', async () => {
    let changeListener: ((state: 'active' | 'inactive' | 'background') => void) | null = null;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((type: string, listener: unknown) => {
      if (type === 'change') changeListener = listener as typeof changeListener;
      return { remove: jest.fn() };
    }) as typeof AppState.addEventListener);

    const tasks: { callback: () => void; cancel: jest.Mock }[] = [];
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((callback) => {
      const task = { callback: callback as () => void, cancel: jest.fn() };
      tasks.push(task);
      return { cancel: task.cancel } as unknown as ReturnType<typeof InteractionManager.runAfterInteractions>;
    });

    const view = await render(<AppLifecycleProvider><LifecycleProbe /></AppLifecycleProvider>);
    await act(() => { tasks[0]?.callback(); });
    expect(screen.getByText('foreground-ready')).toBeTruthy();
    const firstSignal = getForegroundAbortSignal();

    await act(() => { changeListener?.('background'); });
    expect(firstSignal.aborted).toBe(true);
    await act(() => { changeListener?.('inactive'); });
    expect(screen.getByText('inactive')).toBeTruthy();

    await act(() => { changeListener?.('active'); });
    await act(() => { tasks.at(-1)?.callback(); });
    expect(screen.getByText('foreground-ready')).toBeTruthy();
    const restored = getForegroundAbortSignal();
    expect(restored.aborted).toBe(false);
    expect(restored).not.toBe(firstSignal);

    await view.unmount();
  });
});
