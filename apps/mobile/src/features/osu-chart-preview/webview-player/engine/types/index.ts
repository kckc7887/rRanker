/*
 * Source: https://github.com/daladal/replayviewer-js
 * Adapted for fixed-speed chart preview.
 *
 * MIT License
 * 
 * Copyright (c) 2026 bog
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
/**
 * Shared data types for replays, beatmaps, skins, and judgement results — the canonical
 * field reference for the library. Parsers populate these; judges, timelines, playback,
 * and rendering consume them. Unless noted otherwise, times are milliseconds and
 * positions are osu! playfield coordinates (512×384).
 */

/** One input frame from the .osr LZMA stream. Produced by `parseReplay`. */
export interface ReplayFrame {
  /** Milliseconds since the previous frame; the leading frames may be negative (.osr quirk). */
  timeDelta: number;
  x: number;           // osu! playfield coords 0–512
  y: number;           // osu! playfield coords 0–384
  keys: number;        // bitmask: 1=M1, 2=M2, 4=K1, 8=K2, 16=smoke
}

/**
 * A parsed .osr replay. Produced by `parseReplay`; consumed by judgement, playback,
 * and rendering.
 */
export interface ReplayData {
  /**
   * Ruleset the replay was played in: 0=osu!std, 1=taiko, 2=catch, 3=mania.
   * Rendering and judgement dispatch on this (not `BeatmapData.mode`), so std beatmaps
   * can host taiko/catch converts.
   */
  mode: number;
  gameVersion: number;     // >= 30000000 = lazer
  /** MD5 of the .osu the replay was recorded on; used to pick the matching difficulty. */
  beatmapHash: string;
  username: string;
  replayHash: string;
  count300: number;
  count100: number;
  count50: number;
  countGeki: number;
  countKatu: number;
  countMiss: number;
  score: number;
  maxCombo: number;
  perfect: boolean;
  // Legacy bitmask; lazer also populates scoreInfo.mods.
  mods: number;
  /** Raw life-bar graph string from the header (`time|value,` pairs). */
  lifebarGraph: string;
  timestamp: bigint;       // Windows FILETIME ticks
  frames: ReplayFrame[];
  // signed int64; lazer may write a negative value.
  replayId: bigint;
  // Lazer-only trailing LZMA+JSON block.
  scoreInfo?: ScoreInfo;
}

// Hit-result names per lazer (see rplpa/consts.go); superset of stable 300/100/50/miss.
type LazerHitResult =
  | 'none' | 'miss' | 'meh' | 'ok' | 'good' | 'great' | 'perfect'
  | 'small_tick_miss' | 'small_tick_hit'
  | 'large_tick_miss' | 'large_tick_hit'
  | 'small_bonus' | 'large_bonus'
  | 'ignore_miss' | 'ignore_hit'
  | 'combo_break' | 'slider_tail_hit' | 'legacy_combo_increase';

/** Per-result-type counts from a lazer replay's score payload. */
export type LazerStatistics = Partial<Record<LazerHitResult, number>>;

/**
 * One lazer mod. `settings` carries per-mod overrides (speed_change, AR/CS/OD/HP,
 * Classic sub-flags, …).
 */
export interface LazerMod {
  acronym: string;
  settings?: Record<string, unknown>;
}

/**
 * Lazer's trailing JSON score payload from the .osr (absent on stable replays).
 * Unknown fields are preserved as optional.
 */
export interface ScoreInfo {
  mods: LazerMod[];
  online_id?: number;
  statistics?: LazerStatistics;
  maximum_statistics?: LazerStatistics;
  client_version?: string;
  rank?: string;
  user_id?: number;
  pauses?: unknown[];
}

export interface HitCircle {
  type: 'circle';
  x: number;
  y: number;
  time: number;
  /** Hitsound bitmask: 1=normal, 2=whistle, 4=finish, 8=clap. */
  hitSound: number;
  hitSample: HitSample;
  newCombo: boolean;
  comboSkip: number;    // bits 4–6 of type bitmask: extra colors to skip on new combo
  /**
   * Set by `applyStacking` after parsing; 0 = base position, N > 0 = drawn shifted
   * `-N * radius/10` in both x and y (earlier notes in a stack have higher values).
   */
  stackHeight: number;
}

// curvePoints[0] is the absolute object position; subsequent points are also absolute coords.
export interface Slider {
  type: 'slider';
  x: number;
  y: number;
  time: number;
  /** B=bezier, L=linear, P=perfect circle, C=catmull. */
  curveType: 'B' | 'L' | 'P' | 'C';
  curvePoints: { x: number; y: number }[];
  /** Times the ball traverses the path (1 = no repeat); total duration = slide duration × slides. */
  slides: number;       // 1 = no repeat
  /** Pixel length of one slide of the path, from the .osu. */
  length: number;
  hitSound: number;
  hitSample: HitSample;
  newCombo: boolean;
  comboSkip: number;
  /** Same semantics as HitCircle.stackHeight. */
  stackHeight: number;
  // Per-edge hitsound bitmasks. Length slides+1; index 0 = head, index n = end of slide n.
  edgeSounds: number[];
  // Per-edge sample-set overrides, index-matched to edgeSounds.
  // Length slides+1; normalSet/additionSet 0 inherits from hitSample / timing point.
  edgeSets: { normalSet: number; additionSet: number }[];
}

export interface Spinner {
  type: 'spinner';
  time: number;
  endTime: number;
  hitSound: number;
  hitSample: HitSample;
}

// Mania-native hold note (.osu typeFlags bit 7 = 128). x encodes column;
// the mania converter maps it to a column index.
export interface ManiaHold {
  type: 'hold';
  x: number;
  time: number;
  endTime: number;
  hitSound: number;
  hitSample: HitSample;
}

// std/taiko hit-object union. Mania native-mode hold notes live in BeatmapData.maniaHolds
// to keep this union narrow — every std/taiko code path consumes hitObjects directly,
// and widening this would force narrowing helpers throughout those branches.
export type HitObject = HitCircle | Slider | Spinner;

/**
 * Per-object sample overrides (the .osu hitSample field). Zero/empty values inherit
 * from the active timing point.
 */
export interface HitSample {
  normalSet: number;    // 0=inherit from timing point; 1=normal, 2=soft, 3=drum
  additionSet: number;  // 0=inherit from normalSet; applies to whistle/finish/clap
  index: number;        // 0|1=default; 2+=numbered (e.g. soft-hitnormal2)
  volume: number;       // 0=inherit from timing point
  filename: string;     // ''=standard lookup; non-empty=play directly (bypasses name construction)
}

export interface TimingPoint {
  time: number;
  // positive = new BPM; negative = inherited SV multiplier (negative reciprocal * 100).
  beatLength: number;
  meter: number;
  inherited: boolean;
  // Default sample set for objects in this timing region. 0=auto → 1; 1=normal, 2=soft, 3=drum.
  sampleSet: number;
  /** Custom-sample index for this region (2+ → numbered files like soft-hitnormal2). */
  sampleIndex: number;
  // Sample volume 0–100 (.osu 6th field), default 100. A hit object's own sample volume
  // (HitSample.volume > 0) overrides this; volume 0 on the object inherits it. Playback
  // gain = max(resolved volume, 5)/100 (5% floor).
  volume: number;
  // Stable taiko ScoreV1 multiplies score by 1.2× while a kiai point is active;
  // kiai also drives playfield glow effects.
  kiai: boolean;
}

/** A parsed .osu beatmap. Produced by `parseBeatmap`. */
export interface BeatmapData {
  // [General] Mode: 0=std, 1=taiko, 2=catch, 3=mania. Rendering/judgement dispatch on
  // ReplayData.mode, so a std (0) beatmap can host a taiko or catch replay (converted);
  // mania requires matching mode 3 on both sides; a catch beatmap requires a catch replay.
  mode: 0 | 1 | 2 | 3;
  title: string;
  beatmapId?: number | null;
  beatmapsetId?: number | null;
  artist: string;
  version: string;
  audioFilename: string;
  // [General] AudioLeadIn, ms; default 0. Informational only — it does not shift the
  // audio↔beatmap time mapping (audio position 0 always equals beatmap time 0).
  audioLeadIn: number;
  // Raw .osu difficulty values. Consumers read the mod-adjusted ModDifficulty instead
  // of using these directly.
  approachRate: number;
  circleSize: number;
  overallDifficulty: number;
  hpDrainRate: number;
  sliderMultiplier: number;
  sliderTickRate: number;
  // [General] StackLeniency; default 0.7. applyStacking uses preemptMs * stackLeniency
  // as the time threshold for stacking nearby notes.
  stackLeniency: number;
  // "osu file format vN" header; default 14. v<6 uses the old (forward-walk) stacking
  // algorithm; pre-v5 maps draw visuals 24 ms later (stable-era quirk).
  formatVersion: number;
  timingPoints: TimingPoint[];
  hitObjects: HitObject[];
  // Mania-native (mode 3) hold notes (.osu typeFlags bit 7). Empty for std/taiko maps.
  // Mania notes (taps) live in hitObjects as HitCircle entries; only holds need a separate
  // bucket because their endTime field doesn't fit any existing shape.
  maniaHolds: ManiaHold[];
  breaks: BreakPeriod[];
  // Raw .osu bytes, attached by createReplaySession as an optional passthrough for
  // consumers that re-parse the file out-of-band (e.g. difficulty/pp calculators).
  // Undefined outside the session-build path; survives BeatmapAssets reuse.
  rawOsu?: Uint8Array;
}

/** A [Events] break section; times in ms. */
export interface BreakPeriod {
  startTime: number;
  endTime: number;
}

/** Parsed skin.ini values (plus defaults where the ini is silent). */
export interface SkinConfig {
  // '#rrggbb' hex; Combo1..Combo8 in order; empty if no skin loaded.
  comboColors: string[];
  // [Fonts] HitCircleOverlap: skin-native pixels of overlap between adjacent combo-number
  // digits; default -2. Positive = digits closer together.
  hitCircleOverlap: number;
  // [Fonts] HitCirclePrefix: path+stem for combo-number digits, lowercased +
  // forward-slash-normalized; default 'default' → 'default-N.png'. May point at a
  // subfolder ('fonts/hitcircle/default' → 'fonts/hitcircle/default-0.png').
  hitCirclePrefix: string;
  // [Fonts] ScorePrefix: path+stem for score glyphs (digits + -dot/-percent/-x);
  // default 'score'. Also the fallback font where scoreentry-N sprites are absent.
  scorePrefix: string;
  // [Fonts] ComboPrefix: path+stem for the combo counter; stable convention defaults
  // it to the score font ('score').
  comboPrefix: string;
  // [Colours] SliderBorder as '#rrggbb'; default '#ffffff'. Stroke color of the outer
  // slider border ring.
  sliderBorder: string;
  // skin.ini [Colours] SliderTrackOverride; null → slider track uses the combo color
  // (track accent = sliderTrackOverride ?? comboColor).
  sliderTrackOverride: string | null;
  // [General] AllowSliderBallTint (accepts 1/true/yes); default false. When true the
  // slider-ball sprite is multiply-tinted with the current combo color.
  allowSliderBallTint: boolean;
  // [General] Name; '' if absent.
  name: string;
  // '' treated as '1.0'; gates v1/v2 spinner mixing rule.
  version: string;
  // One per [Mania] section in skin.ini; matched at render time by `keys == TotalColumns`.
  // Numeric fields are stored in their RAW skin.ini space (480-px) — the consumer
  // applies the ×1.6 / `(480 - val) * 1.6` conversions appropriate for the field.
  // Image stems are lowercased forward-slash paths.
  maniaSections: ManiaSkinSection[];
}

/** One [Mania] section from skin.ini; numeric fields keep the raw 480-px ini space. */
export interface ManiaSkinSection {
  keys: number;
  /** 480-space; lazer's runtime formula is `(480 - clamp(val, 240, 480)) * 1.6`. */
  hitPosition?: number;
  /** Per-column widths in 480-space (length = `keys`). */
  columnWidth?: number[];
  /** Per-column spacings in 480-space (between columns; length = `keys + 1` in ini, but typically `keys` or fewer). */
  columnSpacing?: number[];
  /** Per-column line widths; raw (NOT scaled by 1.6). */
  columnLineWidth?: number[];
  /** Raw value; default 1. */
  barlineHeight?: number;
  judgementLine?: boolean;
  keysUnderNotes?: boolean;
  /** `UpsideDown: 1` → flip the playfield (upscroll: notes rise from the bottom, hit at the top). */
  upsideDown?: boolean;
  /** 480-space; lazer formula `(480 - val) * 1.6`. */
  lightPosition?: number;
  scorePosition?: number;
  comboPosition?: number;
  /** 0=Stretch, 2=RepeatTop, 3=RepeatBottom, 4=RepeatTopAndBottom. */
  noteBodyStyle?: 0 | 2 | 3 | 4;
  /** 480-space ×1.6. */
  widthForNoteHeightScale?: number;
  /** FPS for hold-light animation; default 24 if ≤0. */
  lightFramePerSecond?: number;
  /**
   * Per-column image overrides keyed by raw ini key (0-based absolute column index).
   * Examples: 'NoteImage0', 'NoteImage0H', 'NoteImage0L', 'NoteImage0T',
   * 'KeyImage0', 'KeyImage0D'. Values are lowercased forward-slash stems (no extension).
   * The non-per-column keys 'StageHint' and 'StageLight' also live here.
   */
  imageLookups: Record<string, string>;
  /** Per-column background colour, 0-indexed (ini keys `Colour1..ColourN` are 1-based). '#rrggbbaa'. */
  colours: (string | undefined)[];
  /** Per-column press-light tint, 0-indexed. '#rrggbbaa'. */
  coloursLight: (string | undefined)[];
  colourColumnLine?: string;
  /** Colour of the judgement line drawn at the hit target when `judgementLine` is true. */
  judgementLineColour?: string;
}

/**
 * A decoded skin: sprites + sounds + parsed skin.ini. Produced by
 * `loadSkin`/`loadSkinFromDir`; combine skins with `mergeSkinAssets` or `buildSkin`.
 */
export interface SkinAssets {
  // Keyed by full lowercased, forward-slash-normalized relative path
  // (e.g. 'hitcircle.png', 'fonts/hitcircle/default-0.png').
  images: Map<string, ImageBitmap>;
  // Keyed by lowercase basename (stable has no hitsound-path directive); populated
  // only when an AudioContext is passed to loadSkin.
  sounds: Map<string, AudioBuffer>;
  config: SkinConfig;
  // Spinner sprites sourced from a single skin by buildSkin — deliberately no base-skin
  // fallback, so one skin's spinner set never mixes into another's via a merge. The
  // spinner renderer reads this map instead of `images`. Empty straight out of loadSkin.
  spinnerImages: Map<string, ImageBitmap>;
}

/**
 * One judged event, produced by the per-ruleset judges and consumed by the
 * score/acc/combo/UR timelines, judgement popups, and hitsound playback.
 * Times are beatmap ms; x/y are playfield coordinates.
 */
export interface HitResult {
  /** Index into the judged object list (hitObjects, or the ruleset's converted objects). */
  objectIndex: number;
  // Std/taiko emit 300|100|50|0. Mania adds 305 (Perfect/rainbow) and 200 (Good)
  // — only set on results with subResult='head'|'tail'|'body' for HoldNote sub-objects
  // or on plain Note results from the mania judge. Std/taiko consumers compare against
  // their own values and ignore unfamiliar ones.
  judgement: 305 | 300 | 200 | 100 | 50 | 0;
  // Mania HoldNote sub-judgement (three sub-results per hold). Note results (and all
  // std/taiko results) leave this undefined.
  subResult?: 'head' | 'tail' | 'body';
  time: number;
  // Override popup time; slider heads use tailTime so popup appears at slider end
  // while combo/accuracy ordering still uses `time`.
  displayTime?: number;
  x: number;
  y: number;
  // Copy of the object's hitSound bitmask so audio playback can decode which samples to trigger.
  hitSound: number;
  // True when this result resets combo (miss, slider tick/repeat-arrow/head miss).
  // A slider tail-only miss gives judgement=0 but comboBreak=false.
  comboBreak: boolean;
  // Slider tick/edge/tail subs: excluded from accuracy, included in combo, no popup.
  isSliderSub?: boolean;
  // Lazer-only accuracy cap for this event. undefined = implicit 300 for base hits
  // (or excluded for subs); 150 = slider-tail default under lazer slider scoring.
  accMax?: 300 | 150;
  // Combo-neutral results: taiko drum-roll/swell ticks (also excluded from accuracy)
  // and catch tiny-droplets/bananas (tinies still count toward accuracy). Distinct from
  // isSliderSub, which is in-combo but off-accuracy.
  comboIgnore?: boolean;
  // Catch-only: which palpable object type produced this result; undefined for other
  // rulesets. Drives the catch score/acc/combo timelines and per-type tallies.
  // Fruit → 300 / comboBreak on miss; droplet → 100 / comboBreak on miss;
  // tinyDroplet → 50 / comboIgnore; banana → bonus / comboIgnore (the 300 on a caught
  // banana is a "caught" sentinel, not an accuracy bucket).
  catchType?: 'fruit' | 'droplet' | 'tinyDroplet' | 'banana';
  // Taiko per-note identity. Distinct from objectIndex because stream-converted sliders
  // emit many hits sharing one objectIndex; noteId is unique per converted note so
  // per-note render state can't collide.
  noteId?: number;
  // Taiko strong-note success: both halves of the colour pair pressed within <30ms.
  strong?: boolean;
  // Time of the second press that completed a strong hit; drives the 50ms explosion crossfade.
  strongSecondHitTime?: number;
  // Std spinner only: total absolute accumulated cursor angle (radians) over the spin.
  // Drives spin-bonus scoring (stable SpinnerPoints/Bonus, lazer Small/LargeBonus).
  spinnerTotalRad?: number;
  // Std spinner only: beatmap-times each spinner-bonus is awarded (popup + spinnerbonus sample).
  spinnerBonusTimes?: number[];
}
