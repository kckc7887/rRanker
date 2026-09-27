import JSZip from 'jszip';
import type { PhiraNoteCounts } from '@/domain/phira';
import { infoValue } from '@/domain/phira-chart-info';
import { resolvePhiraChartZipMediaPlan } from '@/domain/phira-chart-preview';
import {
  CHART_PREVIEW_MAX_EVENTS, CHART_PREVIEW_PARSE_YIELD_INTERVAL, assertChartPreviewNoteCount, assertChartPreviewEventCount,
  assertChartPreviewDownloadBytes, chartPreviewDeclaredUncompressedSize,
  createChartPreviewActualBytes, pauseChartPreviewParse, readBudgetedZipEntry,
  readBudgetedZipText, scanChartPreviewArchiveEntries, type ChartPreviewCancellation,
} from '@/features/chart-preview-shared/chart-preview-resource-budget';
export { infoValue } from '@/domain/phira-chart-info';

/**
 * Phira 谱面读取语义移植自 TeamFlos/phira（GPLv3）：
 * prpr/src/scene/game.rs、prpr/src/core.rs、prpr/src/bin.rs、
 * prpr/src/parse/rpe.rs、prpr/src/parse/pgr.rs、prpr/src/parse/pec.rs
 * 固定提交 398744ac9d2f4864abbdfb454c8cb9968a69fbc5。
 * 此处只保留真 Note 四类计数，不持久化上游谱面内容。
 */

const emptyCounts = (): PhiraNoteCounts => ({ click: 0, hold: 0, flick: 0, drag: 0 });
export const throwIfAborted = (signal?: AbortSignal) => {
  if (!signal?.aborted) return;
  const error = new Error('Phira 谱面读取已取消'); error.name = 'AbortError'; throw error;
};
const addKind = (counts: PhiraNoteCounts, kind: number, mapping: readonly string[]) => {
  const key = mapping[kind] as keyof PhiraNoteCounts | undefined;
  if (key) counts[key] += 1;
};

function* jsonNoteCounts(input: unknown, format: 'rpe' | 'pgr'): Generator<void, PhiraNoteCounts> {
  const counts = emptyCounts();
  const lines = (input as { judgeLineList?: unknown[] })?.judgeLineList;
  if (!Array.isArray(lines)) throw new Error(`${format.toUpperCase()} 谱面缺少 judgeLineList`);
  assertChartPreviewEventCount(lines.length);
  let visitedNotes = 0;
  for (const line of lines) {
    yield;
    const typed = line as { notes?: unknown[]; notesAbove?: unknown[]; notesBelow?: unknown[] };
    const groups = format === 'rpe' ? [typed?.notes] : [typed?.notesAbove, typed?.notesBelow];
    for (const notes of groups) {
      if (notes === undefined) continue;
      if (!Array.isArray(notes)) throw new Error('谱面音符列表无效');
      assertChartPreviewNoteCount(visitedNotes + notes.length);
      for (const raw of notes) {
        visitedNotes += 1; yield;
        const note = raw as { type?: unknown; isFake?: unknown };
        if (format === 'rpe' && (note?.isFake === true || note?.isFake === 1)) continue;
        if (typeof note?.type === 'number') addKind(counts, note.type, format === 'rpe' ? ['', 'click', 'hold', 'flick', 'drag'] : ['', 'click', 'drag', 'hold', 'flick']);
      }
    }
  }
  return counts;
}

function countSynchronously(parser: Generator<void, PhiraNoteCounts>): PhiraNoteCounts {
  for (;;) { const next = parser.next(); if (next.done) return next.value; }
}

export function countRpeNotes(input: unknown): PhiraNoteCounts { return countSynchronously(jsonNoteCounts(input, 'rpe')); }
export function countPgrNotes(input: unknown): PhiraNoteCounts { return countSynchronously(jsonNoteCounts(input, 'pgr')); }

function* pecNoteCounts(text: string): Generator<void, PhiraNoteCounts> {
  const counts = emptyCounts();
  let lineCount = 0; let noteCount = 0;
  for (let position = 0; position <= text.length;) {
    const newline = text.indexOf('\n', position);
    const rawLine = text.slice(position, newline < 0 ? text.length : newline);
    position = newline < 0 ? text.length + 1 : newline + 1;
    assertChartPreviewEventCount(++lineCount); yield;
    const line = rawLine.trim();
    const command = /^n([1-4])(?:\s|$)/.exec(line);
    if (!command) continue;
    assertChartPreviewNoteCount(++noteCount);
    // PEC n1/n3/n4: 最后一个参数为 fake；n2 比其它 Note 多一个结束时间参数。
    const fake = Number(/\s(\S+)$/.exec(line)?.[1] ?? line) === 1;
    if (!fake) addKind(counts, Number(command[1]), ['', 'click', 'hold', 'flick', 'drag']);
  }
  return counts;
}
export function countPecNotes(text: string): PhiraNoteCounts { return countSynchronously(pecNoteCounts(text)); }

class BinaryCursor {
  private offset = 0;
  private operations = 0;
  constructor(private readonly bytes: Uint8Array) {
    if (bytes.byteLength > 32_000_000) throw new Error('PBC 谱面超出读取预算');
  }
  private ensure(size: number) {
    if (++this.operations > CHART_PREVIEW_MAX_EVENTS * 32) throw new Error('PBC 解析步骤超出预算');
    if (!Number.isSafeInteger(size) || size < 0 || this.offset + size > this.bytes.length) throw new Error('PBC 数据截断');
  }
  u8() { this.ensure(1); return this.bytes[this.offset++]; }
  bool() { return this.u8() === 1; }
  uleb() {
    let result = 0; let shift = 0;
    for (;;) {
      const byte = this.u8(); result += (byte & 0x7f) * 2 ** shift;
      if ((byte & 0x80) === 0) return result;
      shift += 7; if (shift > 49) throw new Error('PBC ULEB128 无效');
    }
  }
  f32() { this.ensure(4); const value = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.offset, 4).getFloat32(0, true); this.offset += 4; return value; }
  i32() { this.ensure(4); const value = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.offset, 4).getInt32(0, true); this.offset += 4; return value; }
  string() { const size = this.uleb(); this.ensure(size); const value = new TextDecoder().decode(this.bytes.subarray(this.offset, this.offset + size)); this.offset += size; return value; }
  arrayLength() { const size = this.uleb(); assertChartPreviewEventCount(size); return size; }
}

function* skipAnim(cursor: BinaryCursor, value: () => void): Generator<void> {
  for (;;) {
    const node = cursor.u8(); yield;
    if (node === 0) return;
    if (node !== 1) {
      const length = cursor.arrayLength();
      for (let index = 0; index < length; index += 1) {
        cursor.uleb(); value();
        const tween = cursor.u8();
        if ((tween & 0xc0) === 0x80) { cursor.f32(); cursor.f32(); }
        else if ((tween & 0xc0) === 0xc0) { cursor.f32(); cursor.f32(); cursor.f32(); cursor.f32(); }
        yield;
      }
    }
  }
}
const skipFloatAnim = (cursor: BinaryCursor) => skipAnim(cursor, () => { cursor.f32(); });
const skipColorAnim = (cursor: BinaryCursor) => skipAnim(cursor, () => { cursor.u8(); cursor.u8(); cursor.u8(); cursor.u8(); });
function* skipObject(cursor: BinaryCursor): Generator<void> {
  for (let index = 0; index < 6; index += 1) yield* skipFloatAnim(cursor);
}

function* pbcNoteCounts(bytes: Uint8Array): Generator<void, PhiraNoteCounts> {
  const cursor = new BinaryCursor(bytes);
  const counts = emptyCounts();
  cursor.f32();
  const lineCount = cursor.arrayLength(); let noteCount = 0;
  for (let line = 0; line < lineCount; line += 1) {
    yield* skipObject(cursor);
    const lineKind = cursor.u8();
    if (lineKind === 1 || lineKind === 2) cursor.string();
    else if (lineKind === 3) yield* skipFloatAnim(cursor);
    else if (lineKind !== 0) throw new Error('暂不支持该 PBC 判定线类型');
    yield* skipFloatAnim(cursor);
    const notes = cursor.arrayLength(); assertChartPreviewNoteCount(noteCount + notes); noteCount += notes;
    for (let note = 0; note < notes; note += 1) {
      yield* skipObject(cursor);
      const kind = cursor.u8();
      if (kind === 1) { cursor.f32(); cursor.f32(); }
      if (kind > 3) throw new Error('PBC Note 类型无效');
      cursor.uleb(); cursor.f32();
      if (cursor.bool()) cursor.f32();
      cursor.bool();
      const fake = cursor.bool();
      if (!fake) addKind(counts, kind, ['click', 'hold', 'flick', 'drag']);
      yield;
    }
    yield* skipColorAnim(cursor); cursor.uleb(); cursor.u8(); cursor.u8();
    if (cursor.u8() !== 8) throw new Error('PBC CtrlObject 无效');
    for (let index = 0; index < 5; index += 1) yield* skipFloatAnim(cursor);
    cursor.i32(); yield;
  }
  cursor.u8(); cursor.u8();
  return counts;
}
export function countPbcNotes(bytes: Uint8Array): PhiraNoteCounts { return countSynchronously(pbcNoteCounts(bytes)); }

async function countAsynchronously(parser: Generator<void, PhiraNoteCounts>, cancellation: ChartPreviewCancellation): Promise<PhiraNoteCounts> {
  try {
    for (let iteration = 0; iteration <= CHART_PREVIEW_MAX_EVENTS * 32; iteration += 1) {
      if (iteration % CHART_PREVIEW_PARSE_YIELD_INTERVAL === 0) await pauseChartPreviewParse(iteration, cancellation);
      const next = parser.next(); if (next.done) return next.value;
    }
    throw new Error('谱面解析步骤超出预算');
  } finally { parser.return(emptyCounts()); }
}

export async function countPhiraChartZip(data: ArrayBuffer, signal?: AbortSignal): Promise<PhiraNoteCounts> {
  throwIfAborted(signal);
  assertChartPreviewDownloadBytes(data.byteLength);
  const cancellation: ChartPreviewCancellation = { signal, actualBytes: createChartPreviewActualBytes() };
  const zip = await JSZip.loadAsync(data);
  throwIfAborted(signal);
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  await scanChartPreviewArchiveEntries(Object.values(zip.files), data.byteLength, {
    cancellation, uncompressedSize: chartPreviewDeclaredUncompressedSize,
  });
  const info = entries.find((entry) => /(^|\/)info\.ya?ml$/i.test(entry.name));
  const infoText = info ? await readBudgetedZipText(info, 6_000_000, cancellation) : '';
  throwIfAborted(signal);
  const format = infoValue(infoText, 'format')?.toLowerCase() ?? null;
  const chartName = resolvePhiraChartZipMediaPlan(entries, infoText).chartEntryName;
  const chartEntry = chartName ? zip.file(chartName) : null;
  if (!chartEntry) throw new Error('谱面包中没有可读取的谱面文件');
  if (chartPreviewDeclaredUncompressedSize(chartEntry) > 32_000_000) throw new Error('谱面过大，暂不支持读取');
  const bytes = await readBudgetedZipEntry(chartEntry, cancellation);
  throwIfAborted(signal);
  if (format === 'pbc' || /\.pbc$/i.test(chartEntry.name)) return countAsynchronously(pbcNoteCounts(bytes), cancellation);
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (format === 'pec' || /\.pec$/i.test(chartEntry.name) || !text.trimStart().startsWith('{')) return countAsynchronously(pecNoteCounts(text), cancellation);
  const json = JSON.parse(text) as unknown;
  return countAsynchronously(jsonNoteCounts(json, format === 'rpe' || text.includes('"META"') ? 'rpe' : 'pgr'), cancellation);
}
