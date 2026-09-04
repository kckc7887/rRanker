import { describe, expect, it } from 'vitest';
import {
  arcadeAppearLookaheadMs,
  arcadeHoldStretch,
  arcadeSlideFadeAlpha,
  arcadeSlideFadeInStartMs,
  arcadeTapTravelSpeed,
  arcadeTouchDurations,
  arcadeTravel,
  ARCADE_JUDGE_RADIUS,
  shouldOmitSlideLastArrow,
  SLIDE_FADE_IN_DURATION_MS,
} from '@/features/maimai-chart-preview/engine/utils/arcadeMotion';

describe('arcade motion formulas', () => {
  it('maps user hi-speed 6 to a positive tap travel speed', () => {
    const speed = arcadeTapTravelSpeed(6);
    expect(speed).toBeGreaterThan(8);
    expect(speed).toBeLessThan(12);
  });

  it('places a note on the judge circle at hit time with full scale and a guide ring', () => {
    const travel = arcadeTravel(0, arcadeTapTravelSpeed(6));
    expect(travel.visible).toBe(true);
    expect(travel.scale).toBe(1);
    expect(travel.distance).toBe(ARCADE_JUDGE_RADIUS);
    expect(travel.showGuide).toBe(true);
  });

  it('hides notes before destScale reaches 0', () => {
    const speed = arcadeTapTravelSpeed(6);
    const hidden = arcadeTravel(arcadeAppearLookaheadMs(speed) + 1, speed);
    expect(hidden.visible).toBe(false);
    const appearing = arcadeTravel(arcadeAppearLookaheadMs(speed) - 50, speed);
    expect(appearing.visible).toBe(true);
    expect(appearing.scale).toBeGreaterThanOrEqual(0);
  });

  it('stretches hold body between head and tail distances', () => {
    const speed = arcadeTapTravelSpeed(6);
    const stretch = arcadeHoldStretch(-200, 400, speed);
    expect(stretch).not.toBeNull();
    expect(stretch!.barLen).toBeGreaterThan(0);
    expect(stretch!.headDistance).toBeGreaterThan(stretch!.tailDistance);
  });

  it('uses the official touch duration curve', () => {
    const { wholeDuration, moveDuration, displayDuration } = arcadeTouchDurations(6);
    expect(wholeDuration).toBeCloseTo(3.209385682 * 6 ** -0.9549621752, 8);
    expect(moveDuration).toBeCloseTo(wholeDuration * 0.8, 8);
    expect(displayDuration).toBeCloseTo(wholeDuration * 0.2, 8);
  });

  it('fades slide arrows in over 200ms from the official start offset', () => {
    const speed = arcadeTapTravelSpeed(6);
    const start = arcadeSlideFadeInStartMs(10_000, speed);
    expect(start).toBeLessThan(10_000);
    expect(arcadeSlideFadeAlpha(start - 1, start)).toBe(0);
    expect(arcadeSlideFadeAlpha(start + SLIDE_FADE_IN_DURATION_MS / 2, start)).toBeCloseTo(0.5, 5);
    expect(arcadeSlideFadeAlpha(start + SLIDE_FADE_IN_DURATION_MS, start)).toBe(1);
  });

  it('omits the last slide arrow when it sits closer than πR/64 to the path end', () => {
    expect(shouldOmitSlideLastArrow((Math.PI * 100) / 64 - 0.01, 100)).toBe(true);
    expect(shouldOmitSlideLastArrow((Math.PI * 100) / 64 + 0.01, 100)).toBe(false);
  });
});
