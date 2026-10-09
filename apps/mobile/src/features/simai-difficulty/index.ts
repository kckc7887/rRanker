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

function* difficultyScores(shouldYield: () => boolean, text: string, slot: number): Generator<void, MaimaiDxTagScores | null, void> {
  const chart = yield* parseSimaiChart(shouldYield, text, slot);
  const base = yield* baseBurden(shouldYield, chart), star = yield* starComplexity(shouldYield, chart, base.slideEvents);
  if (!star.coverage.complete || star.raw === null || star.techniqueRaw === null || star.burstRaw === null) return null;
  const rhythm = yield* keyboardRhythmComplexity(shouldYield, chart), input = yield* inputComplexity(shouldYield, chart);
  const result = complexityRadar(legacyRadar(base.features, scale.baseline), support(star.raw, scale.star), {
    star_technique: support(star.techniqueRaw, scale.starTechnique),
    star_burst: support(star.burstRaw, scale.starBurst),
    keyboard_rhythm: support(rhythm.raw, scale.rhythm),
    touch_input: support(input.touchRaw, scale.touch),
    hold_lock: support(input.raw, scale.holdLock),
  });
  return [score(result.键盘), score(result.星星), score(result.技巧), score(result.体力), score(result.爆发)];
}

export async function simaiDifficultyScores(text: string, slot: number, signal?: AbortSignal): Promise<MaimaiDxTagScores | null> {
  let deadline = performance.now();
  const steps = difficultyScores(() => performance.now() >= deadline, text, slot);
  try {
    while (true) {
      if (signal?.aborted) throw signal.reason;
      const next = steps.next();
      if (next.done) return next.value;
      if (performance.now() >= deadline) {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        deadline = performance.now() + 4;
      }
    }
  } catch {
    if (signal?.aborted) throw signal.reason;
    return null;
  } finally {
    steps.return(null);
  }
}
