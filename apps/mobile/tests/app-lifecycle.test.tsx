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
  return <Text>{[
    lifecycle.phase,
    lifecycle.foregroundGeneration,
    lifecycle.memoryWarningGeneration,
  ].join('|')}</Text>;
}

describe('AppLifecycleProvider', () => {
  afterEach(() => jest.restoreAllMocks());

  it('owns the only listeners and cancels an expired foreground recovery', async () => {
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
    expect(AppState.addEventListener).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/foreground-waiting\|0\|0/)).toBeTruthy();

    await act(() => { tasks[0]?.callback(); });
    expect(screen.getByText('foreground-ready|1|0')).toBeTruthy();
    const firstSignal = getForegroundAbortSignal();
    expect(firstSignal.aborted).toBe(false);

    await act(() => { changeListener?.('inactive'); });
    expect(firstSignal.aborted).toBe(true);
    expect(screen.getByText('foreground-waiting|1|0')).toBeTruthy();

    await act(() => { changeListener?.('background'); });
    expect(screen.getByText('background|1|0')).toBeTruthy();
    await act(() => { changeListener?.('active'); });
    const expiredTask = tasks.at(-1)!;
    await act(() => { changeListener?.('background'); });
    expect(expiredTask.cancel).toHaveBeenCalledTimes(1);
    await act(() => { expiredTask.callback(); });
    expect(screen.getByText('background|1|0')).toBeTruthy();

    await act(() => { changeListener?.('active'); });
    await act(() => { tasks.at(-1)?.callback(); });
    expect(screen.getByText('foreground-ready|2|0')).toBeTruthy();
    expect(getForegroundAbortSignal()).not.toBe(firstSignal);

    await act(() => { memoryWarningListener?.(); });
    expect(screen.getByText('foreground-ready|2|1')).toBeTruthy();

    await view.unmount();
    expect(removers[0]).toHaveBeenCalledTimes(1);
    expect(removers[1]).toHaveBeenCalledTimes(1);
  });
});
