/** MajdataViewX motion constants (GPL-3.0). See THIRD_PARTY_NOTICES.md. */
const TAP_SPEED_NUMERATOR = 107.25;
const TAP_SPEED_DENOMINATOR = 71.4184491;
const TAP_SPEED_OFFSET = 0.9975;
const TAP_SPEED_EXPONENT = -0.985558604;
const TOUCH_DURATION_COEFF = 3.209385682;
const TOUCH_DURATION_EXPONENT = -0.9549621752;
const TOUCH_MOVE_FRACTION = 0.8;
const TOUCH_DISPLAY_FRACTION = 0.2;

export function arcadeTapTravelSpeed(userHiSpeed: number): number {
  return TAP_SPEED_NUMERATOR / (TAP_SPEED_DENOMINATOR * (userHiSpeed + TAP_SPEED_OFFSET) ** TAP_SPEED_EXPONENT);
}

export function arcadeTouchDurations(userTouchSpeed: number): {
  wholeDuration: number;
  moveDuration: number;
  displayDuration: number;
} {
  const wholeDuration = TOUCH_DURATION_COEFF * Math.abs(userTouchSpeed) ** TOUCH_DURATION_EXPONENT;
  return { wholeDuration, moveDuration: wholeDuration * TOUCH_MOVE_FRACTION, displayDuration: wholeDuration * TOUCH_DISPLAY_FRACTION };
}

export function breakPulseBrightness(currentTimeMs: number): number {
  const frame = currentTimeMs / (1000 / 60);
  return 0.95 + Math.max(Math.sin(frame * 0.17) * 0.5, 0);
}
