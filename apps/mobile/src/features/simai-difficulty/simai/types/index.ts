/** DXTag cbea1ff20d69c3eaa163c7d967b708bd076e5d96 (MIT), Copyright (c) 2026 尘言.
 * https://github.com/kckc7887/DXTag — see THIRD_PARTY_NOTICES.md.
 */
/** The data contract between the Simai reader and the five-axis analyser. */
export type ButtonPosition = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type TouchPosition = 'C' | 'C1' | 'C2' | `${'A' | 'B' | 'D' | 'E'}${ButtonPosition}`;
export type ChartDifficulty = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type Point2D = {x: number; y: number};
export interface SourceLocation {offset: number; line: number; column: number; text: string}

export interface DivisionSpec {
  raw: string; mode: 'division' | 'seconds-compat'; divisor: number; seconds?: number;
}
export type DurationValue =
  | {mode: 'ratio'; divisor: number; count: number; beats: number}
  | {mode: 'seconds'; seconds: number};
export interface DurationSpec {
  raw: string;
  declarationBpm: number;
  explicitBpm?: number;
  value: DurationValue;
  wait: {mode: 'default-beat'; beats: 1; bpm: number} | {mode: 'seconds'; seconds: number} | {mode: 'none'};
  syntax: 'simai' | 'lxns-seconds-extension';
}
export type SlidePathType = '-' | '>' | '<' | '^' | 'v' | 'p' | 'pp' | 'q' | 'qq' | 's' | 'z' | 'w' | 'V' | 'custom';
export interface SlideSegment {
  type: SlidePathType; startPos: ButtonPosition; endPos: ButtonPosition;
  midPos?: ButtonPosition; code: string; durationMs: number | null; durationSpec?: DurationSpec;
}
export interface SlideBranch {
  segments: SlideSegment[]; delayMs: number; durationMs: number;
  isBreak: boolean; isMine: boolean; waitSpec?: DurationSpec['wait'];
  durationMode?: 'per-segment' | 'whole-path';
}
export interface BaseNote {
  id: number;
  position: ButtonPosition | TouchPosition;
  /** Internal beat/time coordinates include a four-beat lead-in. */
  timing: number; timingMs: number; endTimeMs: number; scoreBeat?: number;
  bpm: number; declaredDivisor?: number; divisionSpec?: DivisionSpec; pseudoEachOffsetMs?: number;
  group: number; source: SourceLocation; hiSpeed: number; usingSV: boolean;
  isBreak: boolean; isEx: boolean; isMine: boolean; isEach: boolean; isSlideEach: boolean;
  isForceStar: boolean; isFakeRotate: boolean;
}
export interface TapNote extends BaseNote {
  type: 'tap' | 'break'; position: ButtonPosition; isStar: boolean; isSpinningStar: boolean;
}
export interface HoldStartNote extends BaseNote {
  type: 'hold-start'; position: ButtonPosition; duration: number; durationMs: number;
  durationSpec?: DurationSpec; isHoldStart: true; isBreakHold: boolean;
}
export interface TouchNote extends BaseNote {
  type: 'touch'; position: TouchPosition; hasFirework: boolean;
}
export interface TouchHoldStartNote extends BaseNote {
  type: 'touch-hold-start'; position: TouchPosition; hasFirework: boolean;
  duration: number; durationMs: number; durationSpec?: DurationSpec; isHoldStart: true;
}
export interface SlideNote extends BaseNote {
  type: 'slide'; position: ButtonPosition; branches: SlideBranch[];
  isHeadless: boolean; headlessMode: 'fade' | 'pop'; isTapHead: boolean; isStartBreak: boolean;
}
export type Note = TapNote | HoldStartNote | TouchNote | TouchHoldStartNote | SlideNote;
export type BpmEvent = {timing: number; bpm: number};
export type DivisorEvent = {timing: number; divisor: number; spec?: DivisionSpec};
export type ScrollEvent = {timeMs: number; velocity: number};
export type SignatureEvent = {timeMs: number; numerator: number; denominator: number};
export type AvailableDifficulties = Partial<Record<number, boolean>>;
export type ChartLevels = Record<string, string>;
export type ChartDesigners = Record<string, string>;
export interface Chart {
  title: string; artist: string; designer: string; level: ChartLevels; designers: ChartDesigners;
  difficulty?: number; availableDifficulties: AvailableDifficulties;
  bpm: number; firstMs: number; durationMs: number; measures: number; notes: Note[];
  bpmEvents: BpmEvent[]; divisorEvents: DivisorEvent[];
  scrollEvents: ScrollEvent[]; signatures: SignatureEvent[];
}
