/**
 * 舞萌谱面确认进场/滑条/touch 运动公式。
 * 数值语义对照 MajdataViewX（GPL-3.0，https://github.com/re-poem/MajdataViewX）
 * 的 TapUpdateJob / HoldUpdateJob / TouchData / SlideData，由 TypeScript 重写为 Canvas 使用；
 * 未复制 C# 或 HLSL。许可证全文见仓库根 THIRD_PARTY_NOTICES.md 与 LICENSES/MajdataViewX-GPL-3.0.txt。
 */

/** 官机判定圈世界半径。 */
export const ARCADE_JUDGE_RADIUS = 4.8;

/** 音符缩放到满尺寸的距离（同时是径向下限）。 */
export const ARCADE_SCALE_FULL_DISTANCE = 1.225;

const TAP_SPEED_NUMERATOR = 107.25;
const TAP_SPEED_DENOMINATOR = 71.4184491;
const TAP_SPEED_OFFSET = 0.9975;
const TAP_SPEED_EXPONENT = -0.985558604;
const TOUCH_DURATION_COEFF = 3.209385682;
const TOUCH_DURATION_EXPONENT = -0.9549621752;
const SLIDE_FADE_IN_DISTANCE = 3.926913;
export const SLIDE_FADE_IN_DURATION_MS = 200;
export const TOUCH_MOVE_FRACTION = 0.8;
export const TOUCH_DISPLAY_FRACTION = 0.2;
export const HOLD_CAP_WORLD = 0.58;
export const GUIDE_RING_MIN_SCALE = 0.3;
/** 60fps 下判定文字约 27 帧。 */
export const JUDGE_HINT_DURATION_MS = 450;

export type ArcadeTravel = {
  /** 径向距离，单位与判定圈半径相同（映射到 canvas 时乘 radius/4.8）。 */
  distance: number;
  scale: number;
  visible: boolean;
  showGuide: boolean;
  guideScale: number;
};

export function arcadeTapTravelSpeed(userHiSpeed: number): number {
  return TAP_SPEED_NUMERATOR / (TAP_SPEED_DENOMINATOR * (userHiSpeed + TAP_SPEED_OFFSET) ** TAP_SPEED_EXPONENT);
}

/** destScale=0 时 rawDistance=-1.275，timingSec=-6.075/speed。 */
export function arcadeAppearLookaheadMs(travelSpeed: number): number {
  const speed = Math.abs(travelSpeed) || 1;
  return (6.075 / speed) * 1000;
}

export function arcadeTravel(
  timeDiffMs: number,
  travelSpeed: number,
  options: { holdWindowMs?: number } = {},
): ArcadeTravel {
  const speed = Math.abs(travelSpeed) || 1;
  const dir = travelSpeed < 0 ? -1 : 1;
  const timingSec = -timeDiffMs / 1000;
  const rawDistance = timingSec * speed + ARCADE_JUDGE_RADIUS;
  const destScale = Math.min(rawDistance * 0.4 + 0.51, 1);
  const holdWindowMs = options.holdWindowMs ?? 0;
  if (destScale < 0) {
    return { distance: 0, scale: 0, visible: false, showGuide: false, guideScale: 0 };
  }
  if (timeDiffMs < -holdWindowMs) {
    return { distance: 0, scale: 0, visible: false, showGuide: false, guideScale: 0 };
  }
  const clamped = Math.max(rawDistance, ARCADE_SCALE_FULL_DISTANCE);
  const distance = dir >= 0
    ? clamped
    : ARCADE_JUDGE_RADIUS * 2 - clamped;
  return {
    distance,
    scale: destScale,
    visible: true,
    showGuide: destScale > GUIDE_RING_MIN_SCALE,
    guideScale: Math.min(clamped / ARCADE_JUDGE_RADIUS, 1),
  };
}

export function arcadeHoldStretch(
  headTimeDiffMs: number,
  tailTimeDiffMs: number,
  travelSpeed: number,
): { headDistance: number; tailDistance: number; barLen: number; scale: number; visible: boolean } | null {
  const speed = Math.abs(travelSpeed) || 1;
  const headTimingSec = -headTimeDiffMs / 1000;
  const tailTimingSec = -tailTimeDiffMs / 1000;
  const headDistance = headTimingSec * speed + ARCADE_JUDGE_RADIUS;
  const destScale = Math.min(headDistance * 0.4 + 0.51, 1);
  if (destScale < 0 || tailTimingSec > 0) return null;
  const tailDistance = tailTimingSec * speed + ARCADE_JUDGE_RADIUS;
  if (headDistance < ARCADE_SCALE_FULL_DISTANCE) {
    return {
      headDistance: ARCADE_SCALE_FULL_DISTANCE,
      tailDistance: ARCADE_SCALE_FULL_DISTANCE,
      barLen: 0,
      scale: destScale,
      visible: true,
    };
  }
  const headClamped = Math.min(headDistance, ARCADE_JUDGE_RADIUS);
  const tailClamped = Math.min(Math.max(tailDistance, ARCADE_SCALE_FULL_DISTANCE), ARCADE_JUDGE_RADIUS);
  return {
    headDistance: headClamped,
    tailDistance: tailClamped,
    barLen: Math.max(headClamped - tailClamped, 0),
    scale: 1,
    visible: true,
  };
}

export function arcadeTouchDurations(userTouchSpeed: number): {
  wholeDuration: number;
  moveDuration: number;
  displayDuration: number;
} {
  const speed = Math.abs(userTouchSpeed) || 1;
  const wholeDuration = TOUCH_DURATION_COEFF * speed ** TOUCH_DURATION_EXPONENT;
  return {
    wholeDuration,
    moveDuration: TOUCH_MOVE_FRACTION * wholeDuration,
    displayDuration: TOUCH_DISPLAY_FRACTION * wholeDuration,
  };
}

export type ArcadeTouchPose = {
  visible: boolean;
  fanDist: number;
  fanAlpha: number;
  inMove: boolean;
};

export function arcadeTouchPose(timeDiffMs: number, userTouchSpeed: number): ArcadeTouchPose {
  const timing = -timeDiffMs / 1000;
  const { wholeDuration, moveDuration, displayDuration } = arcadeTouchDurations(userTouchSpeed);
  if (timing > 0 || -timing > wholeDuration) {
    return { visible: false, fanDist: 0, fanAlpha: 0, inMove: false };
  }
  const pow = -Math.exp(8 * (timing * 0.43 / moveDuration) - 0.85) + 0.42;
  let fanDist = Math.min(Math.max(pow, 0), 0.4);
  let fanAlpha = 1;
  if (-timing < wholeDuration && -timing >= moveDuration) {
    fanAlpha = 1 - Math.min(1, Math.max(0, (-timing - moveDuration) / displayDuration));
    fanDist = 0.4;
  }
  return { visible: true, fanDist, fanAlpha, inMove: -timing <= moveDuration };
}

export function arcadeSlideFadeInStartMs(noteTimingMs: number, travelSpeed: number): number {
  const speed = Math.abs(travelSpeed) || 1;
  return noteTimingMs + (-SLIDE_FADE_IN_DISTANCE / speed) * 1000;
}

export function arcadeSlideFadeAlpha(currentTimeMs: number, fadeInStartMs: number): number {
  if (currentTimeMs < fadeInStartMs) return 0;
  const t = currentTimeMs - fadeInStartMs;
  if (t >= SLIDE_FADE_IN_DURATION_MS) return 1;
  return t / SLIDE_FADE_IN_DURATION_MS;
}

/** 末箭距终点小于 πR/64 时不画（官机 DefaultDistance/2）。 */
export function arcadeSlideLastArrowMinGap(radius: number): number {
  return (Math.PI * radius) / 64;
}

export function shouldOmitSlideLastArrow(distanceToEnd: number, radius: number): boolean {
  return distanceToEnd < arcadeSlideLastArrowMinGap(radius);
}

export function canvasDistanceFromArcade(arcadeDistance: number, radius: number): number {
  return (arcadeDistance / ARCADE_JUDGE_RADIUS) * radius;
}

export function canvasSizeFromNativePx(nativePx: number, radius: number): number {
  return (nativePx / 480) * radius;
}

export function breakPulseBrightness(currentTimeMs: number): number {
  const frame = currentTimeMs / (1000 / 60);
  return 0.95 + Math.max(Math.sin(frame * 0.17) * 0.5, 0);
}
