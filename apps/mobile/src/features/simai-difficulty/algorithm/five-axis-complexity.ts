/** DXTag cbea1ff20d69c3eaa163c7d967b708bd076e5d96 (MIT), Copyright (c) 2026 尘言.
 * https://github.com/kckc7887/DXTag — see THIRD_PARTY_NOTICES.md.
 */
/** Display projection for the independent complexity experiment. No constants,
 * difficulty names or tags are inputs. Button baseline and stamina stay intact;
 * Touch input and held-hand support supplement keyboard and technique. */
export const COMPLEXITY_RADAR_VERSION = 'five-axis-complexity-v2';
export const COMPLEXITY_RADAR_POLICY = Object.freeze({
  version: COMPLEXITY_RADAR_VERSION,
  weights: { starTechnique: .65, keyboardRhythm: .65, starBurst: .65, holdLockTechnique: .65, touchKeyboard: .65, holdLockKeyboard: .35 },
  combination: '100 * (1 - product(1 - normalized support)); old technique/burst are the baseline',
  scale: 'independent all-library deduplicated p99.5 / positive p99 anchors',
  activitySupportFloor: 20,
  activity: 'observed complexity/rhythm support, distinct from archived rule labels',
});
export const RADAR_AXES = ['键盘', '星星', '技巧', '体力', '爆发'] as const;
export type RadarScores = Record<typeof RADAR_AXES[number], number>;
export type RadarSupports = { star_technique: number; keyboard_rhythm: number; star_burst: number; touch_input?: number; hold_lock?: number };
const bounded = (v: number) => Math.max(0, Math.min(100, v));
const rounded = (v: number) => Math.round(bounded(v) * 10) / 10;
/** Match the existing Python radar's round() at exact ties. */
export function roundHalfEven(value: number): number {
  const lower = Math.floor(value), fraction = value - lower;
  return fraction === .5 ? lower + (lower % 2) : Math.round(value);
}
export function legacyRadar(features: Record<string, number>, anchors: Record<string, number>): RadarScores {
  const key = (name: string) => Number(features[name] ?? 0);
  const raw = {
    键盘: key('axis_keyboard_burst') + key('axis_keyboard_stamina') + key('axis_keyboard_technique'),
    星星: key('axis_star_burst') + key('axis_star_stamina') + key('axis_star_technique') + key('axis_star_presence'),
    技巧: key('axis_keyboard_technique') + key('axis_star_technique'),
    体力: key('axis_keyboard_stamina') + key('axis_star_stamina'),
    爆发: key('axis_keyboard_burst') + key('axis_star_burst'),
  };
  for (const axis of RADAR_AXES) {
    if (!(anchors[axis]! > 0) || !Number.isFinite(anchors[axis]) || !Number.isFinite(raw[axis]) || raw[axis] < 0)
      throw Error(`Invalid legacy radar source: ${axis}`);
  }
  return Object.fromEntries(RADAR_AXES.map(axis => [axis, roundHalfEven(bounded(raw[axis] / anchors[axis]! * 100))])) as RadarScores;
}
export function complexityRadar(baseline: RadarScores, starScore: number | null, supports: RadarSupports): RadarScores {
  if (Object.values(baseline).some(v => !Number.isFinite(v) || v < 0 || v > 100)
      || Object.values(supports).some(v => !Number.isFinite(v) || v < 0 || v > 100)
      || (starScore !== null && (!Number.isFinite(starScore) || starScore < 0 || starScore > 100)))
    throw Error('Invalid projection score');
  const weights = COMPLEXITY_RADAR_POLICY.weights;
  const technique = 100 - (100 - baseline.技巧)
    * (1 - weights.starTechnique * supports.star_technique / 100)
    * (1 - weights.keyboardRhythm * supports.keyboard_rhythm / 100)
    * (1 - weights.holdLockTechnique * (supports.hold_lock ?? 0) / 100);
  const keyboard = 100 - (100 - baseline.键盘)
    * (1 - weights.touchKeyboard * (supports.touch_input ?? 0) / 100)
    * (1 - weights.holdLockKeyboard * (supports.hold_lock ?? 0) / 100);
  const burst = 100 - (100 - baseline.爆发) * (1 - weights.starBurst * supports.star_burst / 100);
  return { ...baseline, 键盘: rounded(keyboard), 星星: starScore ?? baseline.星星, 技巧: rounded(technique), 爆发: rounded(burst) };
}
