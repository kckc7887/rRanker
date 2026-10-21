import { act, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { Animated } from 'react-native';
import { CachedContentActivityScope, CachedTabScreen } from '@/components/CachedTabScreen';
import { ScoreRecordCard } from '@/components/ScoreRecordCard';
import { fixtureRecords } from '@/fixtures/sanitized';

let mockFocusEffect: (() => void | (() => void)) | null = null;
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (effect: () => void | (() => void)) => { mockFocusEffect = effect; },
  useIsFocused: () => true,
}));
const originalIdle = globalThis.requestIdleCallback;
const originalCancelIdle = globalThis.cancelIdleCallback;

function observeNativeAnimations() {
  const running = new Set<object>();
  jest.spyOn(Animated, 'loop').mockImplementation(() => {
    const animation = {
      start: () => { running.add(animation); },
      stop: () => { running.delete(animation); },
      reset: () => undefined,
    };
    return animation;
  });
  return running;
}

describe('cached tab animation lifecycle', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    globalThis.requestIdleCallback = originalIdle;
    globalThis.cancelIdleCallback = originalCancelIdle;
  });

  it('runs card animations only while both the row and its parent are active', async () => {
    const running = observeNativeAnimations();
    const record = { ...fixtureRecords[0], achievements: 100.5, rate: 'sssp', fc: 'app', fs: 'fsp' };
    const tree = (row: boolean, parent = true) => <CachedContentActivityScope active={parent}>
      <CachedContentActivityScope active={row}><ScoreRecordCard record={record} /></CachedContentActivityScope>
    </CachedContentActivityScope>;
    const screen = await render(tree(false));
    expect(running.size).toBe(0);
    await screen.rerender(tree(true));
    expect(running.size).toBeGreaterThan(0);
    await screen.rerender(tree(false));
    expect(running.size).toBe(0);
    await screen.rerender(tree(true, false));
    expect(running.size).toBe(0);
    await screen.rerender(tree(true));
    expect(running.size).toBeGreaterThan(0);
    await screen.unmount();
    expect(running.size).toBe(0);
  });

  it('stops animations on blur and resumes only after the focused page settles', async () => {
    const pending = new Map<number, () => void>();
    let nextHandle = 0;
    globalThis.requestIdleCallback = callback => {
      const handle = ++nextHandle;
      pending.set(handle, () => callback({ didTimeout: false, timeRemaining: () => 50 }));
      return handle;
    };
    globalThis.cancelIdleCallback = handle => { pending.delete(handle); };
    const settle = () => { const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach(callback => callback()); };
    const running = observeNativeAnimations();
    const record = { ...fixtureRecords[0], achievements: 100.5, rate: 'sssp', fc: 'app', fs: 'fsp' };
    const screen = await render(<CachedTabScreen><ScoreRecordCard record={record} /></CachedTabScreen>);
    let cleanup: void | (() => void);
    await act(() => { cleanup = mockFocusEffect?.(); });
    expect(running.size).toBe(0);
    await act(settle);
    expect(running.size).toBeGreaterThan(0);
    await act(() => { cleanup?.(); });
    expect(running.size).toBe(0);
    await act(() => { cleanup = mockFocusEffect?.(); });
    expect(running.size).toBe(0);
    await act(settle);
    expect(running.size).toBeGreaterThan(0);
    await act(() => { cleanup?.(); });
    await act(() => { cleanup = mockFocusEffect?.(); });
    await act(() => { cleanup?.(); });
    await act(settle);
    expect(running.size).toBe(0);
    await screen.unmount();
  });

});
