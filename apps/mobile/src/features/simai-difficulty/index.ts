/** DXTag cbea1ff20d69c3eaa163c7d967b708bd076e5d96 (MIT), Copyright (c) 2026 尘言.
 * https://github.com/kckc7887/DXTag — see THIRD_PARTY_NOTICES.md.
 */
import type { MaimaiDxTagScores } from '@/domain/maimai-dxtag';
import { parseSimaiChart } from './simai/core/parser/SimaiParser';
import { baseBurden } from './algorithm/base-burden';
import { starComplexity } from './algorithm/star-complexity';
import { keyboardRhythmComplexity } from './algorithm/rhythm-complexity';
import { inputComplexity } from './algorithm/input-complexity';
import { complexityRadar, legacyRadar } from './algorithm/five-axis-complexity';
import scale from './scale.json';

const support = (raw: number, anchor: number) => Math.round(Math.max(0, Math.min(100, raw / anchor * 100)) * 10) / 10;
const score = (value: number) => Math.round(value) / 10;

export function simaiDifficultyScores(text: string, slot: number): MaimaiDxTagScores | null {
  try {
    const chart = parseSimaiChart(text, slot);
    const base = baseBurden(chart), star = starComplexity(chart, base.slideEvents);
    if (!star.coverage.complete || star.raw === null || star.techniqueRaw === null || star.burstRaw === null) return null;
    const rhythm = keyboardRhythmComplexity(chart), input = inputComplexity(chart);
    const result = complexityRadar(legacyRadar(base.features, scale.baseline), support(star.raw, scale.star), {
      star_technique: support(star.techniqueRaw, scale.starTechnique),
      star_burst: support(star.burstRaw, scale.starBurst),
      keyboard_rhythm: support(rhythm.raw, scale.rhythm),
      touch_input: support(input.touchRaw, scale.touch),
      hold_lock: support(input.raw, scale.holdLock),
    });
    return [score(result.键盘), score(result.星星), score(result.技巧), score(result.体力), score(result.爆发)];
  } catch {
    return null;
  }
}
