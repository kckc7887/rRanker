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
/** 回放与谱面时间用 ms；谱面坐标使用 512×384 场地。 */

export interface ReplayFrame {
  /** 回放起始帧的时间差可能为负。 */
  timeDelta: number;
  x: number;
  y: number;
  keys: number;        /** 按位：M1=1，M2=2，K1=4，K2=8，smoke=16。 */
}

export interface ReplayData {
  /** 按回放模式判定；standard 谱面可转 taiko/catch。 */
  mode: number;
  gameVersion: number;     /** 版本 >=30000000 表示 lazer。 */

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

  mods: number;

  lifebarGraph: string;
  timestamp: bigint;       /** Windows FILETIME 刻度。 */
  frames: ReplayFrame[];
  /** 有符号 64 位，lazer 可写负值。 */
  replayId: bigint;

  scoreInfo?: ScoreInfo;
}

type LazerHitResult =
  | 'none' | 'miss' | 'meh' | 'ok' | 'good' | 'great' | 'perfect'
  | 'small_tick_miss' | 'small_tick_hit'
  | 'large_tick_miss' | 'large_tick_hit'
  | 'small_bonus' | 'large_bonus'
  | 'ignore_miss' | 'ignore_hit'
  | 'combo_break' | 'slider_tail_hit' | 'legacy_combo_increase';

export type LazerStatistics = Partial<Record<LazerHitResult, number>>;

export interface LazerMod {
  acronym: string;
  settings?: Record<string, unknown>;
}

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
  /** 音效按位：normal=1，whistle=2，finish=4，clap=8。 */
  hitSound: number;
  hitSample: HitSample;
  newCombo: boolean;
  comboSkip: number;    /** type 掩码第 4–6 位表示新 combo 跳过的颜色数。 */
  /** 堆叠偏移为 -N×radius/10，早音符层数更高。 */
  stackHeight: number;
}

/** 所有曲线控制点都用绝对坐标。 */
export interface Slider {
  type: 'slider';
  x: number;
  y: number;
  time: number;
  /** B 贝塞尔，L 折线，P 圆弧，C Catmull。 */
  curveType: 'B' | 'L' | 'P' | 'C';
  curvePoints: { x: number; y: number }[];

  slides: number;
  /** 单次滑动路径长度，单位 osu! 像素。 */
  length: number;
  hitSound: number;
  hitSample: HitSample;
  newCombo: boolean;
  comboSkip: number;

  stackHeight: number;
  /** edgeSounds[0] 是头，之后是各次滑动尾；缺项继承。 */

  edgeSounds: number[];
  /** 音色 0 或缺项继承 hitSample/时间点。 */

  edgeSets: { normalSet: number; additionSet: number }[];
}

export interface Spinner {
  type: 'spinner';
  time: number;
  endTime: number;
  hitSound: number;
  hitSample: HitSample;
}

/** mania 长押使用 type 掩码 128，x 映射到列。 */

export interface ManiaHold {
  type: 'hold';
  x: number;
  time: number;
  endTime: number;
  hitSound: number;
  hitSample: HitSample;
}

export type HitObject = HitCircle | Slider | Spinner;

/** 音色/音量为 0 时继承当前时间点。 */
export interface HitSample {
  normalSet: number;
  additionSet: number;
  index: number;        /** 0/1 为默认音效，>=2 为编号音效。 */
  volume: number;
  filename: string;
}

export interface TimingPoint {
  time: number;
  /** 正数为每拍 ms，负数以 -100/值 表示 SV 倍率。 */
  beatLength: number;
  meter: number;
  inherited: boolean;
  /** 音色组：0/1 normal，2 soft，3 drum。 */
  sampleSet: number;

  sampleIndex: number;
  /** 时间点音量 0–100；音符音量 0 继承，播放增益至少 5%。 */

  volume: number;

  kiai: boolean;
}

export interface BeatmapData {

  mode: 0 | 1 | 2 | 3;
  title: string;
  beatmapId?: number | null;
  beatmapsetId?: number | null;
  artist: string;
  version: string;
  audioFilename: string;
  /** AudioLeadIn 不移动音频与谱面零点。 */

  audioLeadIn: number;

  approachRate: number;
  circleSize: number;
  overallDifficulty: number;
  hpDrainRate: number;
  sliderMultiplier: number;
  sliderTickRate: number;

  stackLeniency: number;

  formatVersion: number;
  timingPoints: TimingPoint[];
  hitObjects: HitObject[];

  maniaHolds: ManiaHold[];
  breaks: BreakPeriod[];

  rawOsu?: Uint8Array;
}

export interface BreakPeriod {
  startTime: number;
  endTime: number;
}

export interface SkinConfig {

  comboColors: string[];
  /** 使用皮肤原生像素；正值让数字靠近。 */

  hitCircleOverlap: number;

  hitCirclePrefix: string;

  scorePrefix: string;

  comboPrefix: string;

  sliderBorder: string;

  sliderTrackOverride: string | null;

  allowSliderBallTint: boolean;

  name: string;
  /** 空 Version 按 1.0 解释，决定 spinner 素材混合规则。 */
  version: string;
  /** mania 尺寸保留 skin.ini 的 480px 原值。 */

  maniaSections: ManiaSkinSection[];
}

export interface ManiaSkinSection {
  keys: number;
  /** HitPosition：(480-clamp(v,240,480))×1.6。 */
  hitPosition?: number;

  columnWidth?: number[];
  /** ColumnSpacing 可含 keys+1 项，首尾也计入。 */
  columnSpacing?: number[];
  /** 线宽使用原值，不乘 1.6。 */
  columnLineWidth?: number[];

  barlineHeight?: number;
  judgementLine?: boolean;
  keysUnderNotes?: boolean;

  upsideDown?: boolean;
  /** ScorePosition：(480-v)×1.6。 */
  lightPosition?: number;
  scorePosition?: number;
  comboPosition?: number;
  /** 长押体：0 拉伸，2 头重复，3 尾重复，4 首尾重复。 */
  noteBodyStyle?: 0 | 2 | 3 | 4;

  widthForNoteHeightScale?: number;

  lightFramePerSecond?: number;
  /** 列素材用 0 基索引，也包含 StageHint/StageLight。 */
  imageLookups: Record<string, string>;
  /** Colour1..N 转换为 0 基索引。 */
  colours: (string | undefined)[];

  coloursLight: (string | undefined)[];
  colourColumnLine?: string;

  judgementLineColour?: string;
}

export interface SkinAssets {
  /** 图片按完整小写相对路径索引，音效只按小写文件名索引。 */

  images: Map<string, ImageBitmap>;

  sounds: Map<string, AudioBuffer>;
  config: SkinConfig;
  /** spinner 整组只取同一皮肤，不混入 base 皮肤素材。 */

  spinnerImages: Map<string, ImageBitmap>;
}

export interface HitResult {

  objectIndex: number;
  /** mania 额外使用 305(Perfect)、200(Good)。 */

  judgement: 305 | 300 | 200 | 100 | 50 | 0;

  subResult?: 'head' | 'tail' | 'body';
  time: number;
  /** 滑条头的 popupTime 指向尾部；计分排序仍用 time。 */

  displayTime?: number;
  x: number;
  y: number;

  hitSound: number;
  /** 仅滑条尾失误不打断 combo。 */

  comboBreak: boolean;
  /** 滑条子判定计 combo，不计准确率，也不弹字。 */
  isSliderSub?: boolean;
  /** lazer 滑条尾默认准确率上限 150，基础音符 300。 */

  accMax?: 300 | 150;
  /** tinyDroplet 不计 combo 但计准确率；banana 仅奖励分。 */

  comboIgnore?: boolean;

  /** banana 的 300 仅表示接到，不参与准确率。 */

  catchType?: 'fruit' | 'droplet' | 'tinyDroplet' | 'banana';
  /** taiko 转换后每音符的独立 ID，objectIndex 可重复。 */

  noteId?: number;

  strong?: boolean;

  strongSecondHitTime?: number;
  /** spinner 累计绝对角度，单位弧度。 */

  spinnerTotalRad?: number;

  spinnerBonusTimes?: number[];
}
