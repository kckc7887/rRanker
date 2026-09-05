export type ButtonPosition = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type TouchPosition = 'C' | 'C1' | 'C2' | `${'A' | 'B' | 'D' | 'E'}${ButtonPosition}`;
export type ChartDifficulty = 1 | 2 | 3 | 4 | 5 | 6;
export type MirrorMode = 'none' | 'horizontal' | 'vertical' | 'rotate180';
export type JudgmentLineDesign = 'blind' | 'noLine' | 'simple' | 'sensor';
export type JudgeHintMode = 'distinguish' | 'unified' | 'hidden';
export type Point2D = { x: number; y: number };
export type SourceLocation = { offset: number; line: number; column: number; text: string };
export type SlidePathType = '-' | '>' | '<' | '^' | 'v' | 'p' | 'pp' | 'q' | 'qq' | 's' | 'z' | 'w' | 'V' | 'custom';
export type SlideSegment = { type: SlidePathType; startPos: ButtonPosition; endPos: ButtonPosition; midPos?: ButtonPosition; code: string; durationMs: number | null };
export type SlideBranch = { segments: SlideSegment[]; delayMs: number; durationMs: number; isBreak: boolean; isMine: boolean };
export interface BaseNote {
  id: number; position: ButtonPosition | TouchPosition; timing: number; timingMs: number; endTimeMs: number;
  bpm: number; hiSpeed: number; usingSV: boolean; isBreak: boolean; isEx: boolean; isMine: boolean;
  isEach: boolean; isSlideEach: boolean; group: number; source: SourceLocation;
  isForceStar: boolean; isFakeRotate: boolean;
}
export interface TapNote extends BaseNote { type: 'tap' | 'break'; position: ButtonPosition; isStar: boolean; isSpinningStar: boolean }
export interface HoldStartNote extends BaseNote { type: 'hold-start'; position: ButtonPosition; duration: number; durationMs: number; isHoldStart: true; isBreakHold: boolean }
export interface TouchNote extends BaseNote { type: 'touch'; position: TouchPosition; hasFirework: boolean }
export interface TouchHoldStartNote extends BaseNote { type: 'touch-hold-start'; position: TouchPosition; duration: number; durationMs: number; hasFirework: boolean; isHoldStart: true }
export interface SlideNote extends BaseNote { type: 'slide'; position: ButtonPosition; isHeadless: boolean; headlessMode: 'fade' | 'pop'; isTapHead: boolean; isStartBreak: boolean; branches: SlideBranch[] }
export type Note = TapNote | HoldStartNote | TouchNote | TouchHoldStartNote | SlideNote;
export type BpmEvent = { timing: number; bpm: number };
export type DivisorEvent = { timing: number; divisor: number };
export type ScrollEvent = { timeMs: number; velocity: number };
export type SignatureEvent = { timeMs: number; numerator: number; denominator: number };
export type AvailableDifficulties = Partial<Record<number, boolean>>;
export type ChartLevels = Record<string, string>;
export type ChartDesigners = Record<string, string>;
export interface Chart {
  title: string; artist: string; designer: string; bpm: number; level: ChartLevels; designers: ChartDesigners;
  difficulty?: number; availableDifficulties: AvailableDifficulties; measures: number; notes: Note[];
  bpmEvents: BpmEvent[]; divisorEvents: DivisorEvent[]; scrollEvents: ScrollEvent[]; signatures: SignatureEvent[];
  firstMs: number; durationMs: number;
}
export const DIFFICULTY_NAMES: Record<ChartDifficulty, string> = { 1: 'EASY', 2: 'BASIC', 3: 'ADVANCED', 4: 'EXPERT', 5: 'MASTER', 6: 'Re:MASTER' };
export const DIFFICULTY_COLORS: Record<ChartDifficulty, string> = { 1: '#1E3A8A', 2: '#22C55E', 3: '#EAB308', 4: '#EF4444', 5: '#A855F7', 6: '#F8FAFC' };
export interface RendererConfig {
  hiSpeed: number; alwaysKeepHiSpeed: boolean; playbackSpeed: number; mirrorMode: MirrorMode;
  highlightExNotes: boolean; normalColorBreakSlide: boolean; pinkSlideStart: boolean; slideRotation: boolean;
  judgmentLineDesign: JudgmentLineDesign; showBpm: boolean; showNoteTotal: boolean; showBreakCount: boolean;
  showBreakIndex: boolean; rainbowBpm: boolean; ddrColorMode: boolean; ddrColorExtended: boolean;
  showFireworks: boolean; showHitEffect: boolean; judgeHint: JudgeHintMode;
}
export interface AudioConfig { enabled: boolean; holdEndSoundEnabled: boolean; touchSoundEnabled: boolean; volume: number; timingOffsetMs: number }
