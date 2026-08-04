const CENTERED_FIREWORK_PEAK_RADIUS_RATIO = 5 / 4.5;

/**
 * 烟花从触发点扩张时，峰值至少覆盖播放圆最远端；圆心触发保留原有峰值大小。
 */
export function fireworkCoveragePeakRadius(
  playRadius: number,
  playCenterX: number,
  playCenterY: number,
  originX: number,
  originY: number,
): number {
  const centeredPeakRadius = playRadius * CENTERED_FIREWORK_PEAK_RADIUS_RATIO;
  const distanceFromCenter = Math.hypot(originX - playCenterX, originY - playCenterY);
  return Math.max(centeredPeakRadius, playRadius + distanceFromCenter);
}
