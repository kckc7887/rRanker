/** DXTag cbea1ff20d69c3eaa163c7d967b708bd076e5d96 (MIT), Copyright (c) 2026 尘言.
 * https://github.com/kckc7887/DXTag — see THIRD_PARTY_NOTICES.md.
 */
export type SlideEvent = {
  slideId: number; branchIndex: number; headMs: number; waitMs: number; startMs: number; endMs: number;
  headBeat: number; startBeat: number; endBeat: number; declaredWaitBeats: number;
  headPosition: number; headless: boolean;
  segments: { code: string; startMs: number; endMs: number; length: number }[];
};
