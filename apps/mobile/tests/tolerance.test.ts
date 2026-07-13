import { calculateAchievement, maximumSameErrors, singleNoteLoss } from '@/domain/tolerance';

describe('achievement tolerance', () => {
  it('calculates normal-note and mixed judgments deterministically', () => {
    const notes = { tap: 100, hold: 0, slide: 0, touch: 0, break: 0 };
    expect(calculateAchievement(notes, { tap: { great: 1 } })).toBeCloseTo(99.8, 8);
    expect(singleNoteLoss(notes, 'tap', 'great')).toBeCloseTo(0.2, 8);
    expect(maximumSameErrors(notes, 99, 'tap', 'great')).toBe(10);
  });
  it('handles BREAK base score and bonus independently', () => {
    const notes = { tap: 0, hold: 0, slide: 0, touch: 0, break: 1 };
    expect(calculateAchievement(notes, {})).toBe(101);
    expect(calculateAchievement(notes, { break: { perfect1: 1 } })).toBe(100.75);
    expect(calculateAchievement(notes, { break: { great1: 1 } })).toBeCloseTo(80.4, 8);
  });
  it('rejects zero totals and BREAK calculations without BREAK notes', () => {
    expect(() => calculateAchievement({ tap: 0, hold: 0, slide: 0, touch: 0, break: 0 }, {})).toThrow('总物量');
    expect(() => singleNoteLoss({ tap: 1, hold: 0, slide: 0, touch: 0, break: 0 }, 'break', 'great1')).toThrow('零 BREAK');
  });
});
