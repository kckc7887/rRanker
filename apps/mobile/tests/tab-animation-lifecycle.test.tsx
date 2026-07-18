import { act, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { Animated, InteractionManager } from 'react-native';
import { CachedTabScreen } from '@/components/CachedTabScreen';
import { ScoreRecordCard } from '@/components/ScoreRecordCard';
import { fixtureRecords } from '@/fixtures/sanitized';

let mockFocusEffect: (() => void | (() => void)) | null = null;

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (effect: () => void | (() => void)) => { mockFocusEffect = effect; },
}));

describe('cached tab animation lifecycle', () => {
  afterEach(() => jest.restoreAllMocks());

  it('stops native looping animations on blur and restarts them only on refocus', async () => {
    let pendingActivation: (() => void) | null = null;
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((callback) => {
      pendingActivation = callback as () => void;
      return { cancel: jest.fn() } as unknown as ReturnType<typeof InteractionManager.runAfterInteractions>;
    });

    const animations: { start: jest.Mock; stop: jest.Mock }[] = [];
    jest.spyOn(Animated, 'loop').mockImplementation(() => {
      const animation = { start: jest.fn(), stop: jest.fn(), reset: jest.fn() };
      animations.push(animation);
      return animation as unknown as ReturnType<typeof Animated.loop>;
    });

    const record = {
      ...fixtureRecords[0],
      achievements: 100.5,
      rate: 'sssp',
      fc: 'app',
      fs: 'fsp',
    };
    await render(<CachedTabScreen><ScoreRecordCard record={record} /></CachedTabScreen>);

    let cleanup: void | (() => void);
    await act(() => { cleanup = mockFocusEffect?.(); });
    await act(() => { pendingActivation?.(); });
    const foregroundAnimations = [...animations];
    expect(foregroundAnimations.length).toBeGreaterThan(0);
    expect(foregroundAnimations.every((animation) => animation.start.mock.calls.length === 1)).toBe(true);

    await act(() => { cleanup?.(); });
    expect(foregroundAnimations.every((animation) => animation.stop.mock.calls.length === 1)).toBe(true);
    expect(animations).toHaveLength(foregroundAnimations.length);

    let secondCleanup: void | (() => void);
    await act(() => { secondCleanup = mockFocusEffect?.(); });
    const resumedAnimations = animations.slice(foregroundAnimations.length);
    expect(resumedAnimations).toHaveLength(foregroundAnimations.length);
    expect(resumedAnimations.every((animation) => animation.start.mock.calls.length === 1)).toBe(true);

    await act(() => { secondCleanup?.(); });
    expect(resumedAnimations.every((animation) => animation.stop.mock.calls.length === 1)).toBe(true);
    expect(animations).toHaveLength(foregroundAnimations.length * 2);
  });
});
