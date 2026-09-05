import * as IdleTasks from '@/state/idle-tasks';
import { act, render, within } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { Animated } from 'react-native';
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

  it('stops native looping animations on blur and restarts them after refocus settles', async () => {
    const pendingTasks: { callback: () => void; cancel: jest.Mock }[] = [];
    jest.spyOn(IdleTasks, 'scheduleIdleTask').mockImplementation((callback) => {
      const task = { callback: callback as () => void, cancel: jest.fn() };
      pendingTasks.push(task);
      return { cancel: task.cancel } as unknown as ReturnType<typeof IdleTasks.scheduleIdleTask>;
    });

    const animations: { start: jest.Mock; stop: jest.Mock }[] = [];
    jest.spyOn(Animated, 'loop').mockImplementation(() => {
      const animation = { start: jest.fn(), stop: jest.fn(), reset: jest.fn() };
      animations.push(animation);
      return animation as unknown as ReturnType<typeof Animated.loop>;
    });
    const timing = jest.spyOn(Animated, 'timing');

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
    expect(animations).toHaveLength(0);
    await act(() => { pendingTasks[0]?.callback(); });
    const foregroundAnimations = [...animations];
    expect(foregroundAnimations.length).toBeGreaterThan(0);
    expect(foregroundAnimations.every((animation) => animation.start.mock.calls.length === 1)).toBe(true);
    expect(timing.mock.calls.every(([, config]) => (
      config as { isInteraction?: boolean }
    ).isInteraction === false)).toBe(true);

    await act(() => { cleanup?.(); });
    expect(foregroundAnimations.every((animation) => animation.stop.mock.calls.length === 1)).toBe(true);
    expect(animations).toHaveLength(foregroundAnimations.length);

    let secondCleanup: void | (() => void);
    await act(() => { secondCleanup = mockFocusEffect?.(); });
    expect(pendingTasks).toHaveLength(2);
    expect(animations).toHaveLength(foregroundAnimations.length);
    await act(() => { pendingTasks[1]?.callback(); });
    const resumedAnimations = animations.slice(foregroundAnimations.length);
    expect(resumedAnimations).toHaveLength(foregroundAnimations.length);
    expect(resumedAnimations.every((animation) => animation.start.mock.calls.length === 1)).toBe(true);

    await act(() => { secondCleanup?.(); });
    expect(resumedAnimations.every((animation) => animation.stop.mock.calls.length === 1)).toBe(true);
    expect(animations).toHaveLength(foregroundAnimations.length * 2);

    let thirdCleanup: void | (() => void);
    await act(() => { thirdCleanup = mockFocusEffect?.(); });
    expect(pendingTasks).toHaveLength(3);
    expect(animations).toHaveLength(foregroundAnimations.length * 2);
    await act(() => { thirdCleanup?.(); });
    expect(pendingTasks[2]?.cancel).toHaveBeenCalledTimes(1);
    expect(animations).toHaveLength(foregroundAnimations.length * 2);
  });

  it('shows U·TA·GE score data without a Rating block', async () => {
    const record = {
      ...fixtureRecords[0]!,
      songId: '100123',
      title: '原曲标题',
      type: 'UTAGE' as const,
      levelIndex: 0,
      difficulty: 'utage' as const,
      difficultyConstant: 0,
      achievements: 100.5,
      dxScore: 1234,
      rating: 0,
      rate: 'sssp',
    };
    const screen = await render(<ScoreRecordCard record={record} />);
    const card = within(screen.getByLabelText('查看谱面 原曲标题 UTAGE utage'));

    expect(card.getByText('DX分数 1234')).toBeTruthy();
    expect(card.queryByText('Rating')).toBeNull();
  });
});
