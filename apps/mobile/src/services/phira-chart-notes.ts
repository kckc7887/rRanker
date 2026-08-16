import JSZip from 'jszip';
import type { PhiraNoteCounts } from '@/domain/phira';

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

export function countRpeNotes(input: unknown): PhiraNoteCounts {
  const counts = emptyCounts();
  const lines = (input as { judgeLineList?: unknown[] })?.judgeLineList;
  if (!Array.isArray(lines)) throw new Error('RPE 谱面缺少 judgeLineList');
  for (const line of lines) {
    const notes = (line as { notes?: unknown[] })?.notes;
    if (!Array.isArray(notes)) continue;
    for (const raw of notes) {
      const note = raw as { type?: unknown; isFake?: unknown };
      if (note.isFake === true || note.isFake === 1) continue;
      if (typeof note.type === 'number') addKind(counts, note.type, ['', 'click', 'hold', 'flick', 'drag']);
    }
  }
  return counts;
}

export function countPgrNotes(input: unknown): PhiraNoteCounts {
  const counts = emptyCounts();
  const lines = (input as { judgeLineList?: unknown[] })?.judgeLineList;
  if (!Array.isArray(lines)) throw new Error('PGR 谱面缺少 judgeLineList');
  for (const line of lines) {
    const typed = line as { notesAbove?: unknown[]; notesBelow?: unknown[] };
    for (const raw of [...(typed.notesAbove ?? []), ...(typed.notesBelow ?? [])]) {
      const kind = (raw as { type?: unknown }).type;
      if (typeof kind === 'number') addKind(counts, kind, ['', 'click', 'drag', 'hold', 'flick']);
    }
  }
  return counts;
}

export function countPecNotes(text: string): PhiraNoteCounts {
  const counts = emptyCounts();
  for (const rawLine of text.split(/\r?\n/)) {
    const tokens = rawLine.trim().split(/\s+/);
    const command = /^n([1-4])$/.exec(tokens[0] ?? '');
    if (!command) continue;
    // PEC n1/n3/n4: 最后一个参数为 fake；n2 比其它 Note 多一个结束时间参数。
    const fake = Number(tokens[tokens.length - 1]) === 1;
    if (!fake) addKind(counts, Number(command[1]), ['', 'click', 'hold', 'flick', 'drag']);
  }
  return counts;
}

class BinaryCursor {
  private offset = 0;
  constructor(private readonly bytes: Uint8Array) {}
  private ensure(size: number) { if (this.offset + size > this.bytes.length) throw new Error('PBC 数据截断'); }
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
  array(read: () => void) { const size = this.uleb(); for (let index = 0; index < size; index += 1) read(); }
}

function skipAnim(cursor: BinaryCursor, value: () => void): void {
  for (;;) {
    const node = cursor.u8();
    if (node === 0) return;
    if (node !== 1) cursor.array(() => {
      cursor.uleb(); value();
      const tween = cursor.u8();
      if ((tween & 0xc0) === 0x80) { cursor.f32(); cursor.f32(); }
      else if ((tween & 0xc0) === 0xc0) { cursor.f32(); cursor.f32(); cursor.f32(); cursor.f32(); }
    });
  }
}
const skipFloatAnim = (cursor: BinaryCursor) => skipAnim(cursor, () => { cursor.f32(); });
const skipColorAnim = (cursor: BinaryCursor) => skipAnim(cursor, () => { cursor.u8(); cursor.u8(); cursor.u8(); cursor.u8(); });
function skipObject(cursor: BinaryCursor) {
  skipFloatAnim(cursor); skipFloatAnim(cursor); skipFloatAnim(cursor);
  skipFloatAnim(cursor); skipFloatAnim(cursor); skipFloatAnim(cursor);
}

export function countPbcNotes(bytes: Uint8Array): PhiraNoteCounts {
  const cursor = new BinaryCursor(bytes);
  const counts = emptyCounts();
  cursor.f32();
  cursor.array(() => {
    skipObject(cursor);
    const lineKind = cursor.u8();
    if (lineKind === 1 || lineKind === 2) cursor.string();
    else if (lineKind === 3) skipFloatAnim(cursor);
    else if (lineKind !== 0) throw new Error('暂不支持该 PBC 判定线类型');
    skipFloatAnim(cursor);
    cursor.array(() => {
      skipObject(cursor);
      const kind = cursor.u8();
      if (kind === 1) { cursor.f32(); cursor.f32(); }
      if (kind > 3) throw new Error('PBC Note 类型无效');
      cursor.uleb(); cursor.f32();
      if (cursor.bool()) cursor.f32();
      cursor.bool();
      const fake = cursor.bool();
      if (!fake) addKind(counts, kind, ['click', 'hold', 'flick', 'drag']);
    });
    skipColorAnim(cursor); cursor.uleb(); cursor.u8(); cursor.u8();
    if (cursor.u8() !== 8) throw new Error('PBC CtrlObject 无效');
    skipFloatAnim(cursor); skipFloatAnim(cursor); skipFloatAnim(cursor); skipFloatAnim(cursor);
    skipFloatAnim(cursor); cursor.i32();
  });
  cursor.u8(); cursor.u8();
  return counts;
}

export function infoValue(text: string, key: string): string | null {
  const match = text.match(new RegExp(`^\\s*${key}\\s*:\\s*(.+?)\\s*$`, 'mi'));
  return match?.[1]?.replace(/^['"]|['"]$/g, '') ?? null;
}

export async function countPhiraChartZip(data: ArrayBuffer, signal?: AbortSignal): Promise<PhiraNoteCounts> {
  throwIfAborted(signal);
  const zip = await JSZip.loadAsync(data);
  throwIfAborted(signal);
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  const info = entries.find((entry) => /(^|\/)info\.ya?ml$/i.test(entry.name));
  const infoText = info ? await info.async('text') : '';
  throwIfAborted(signal);
  const chartName = infoValue(infoText, 'chart');
  const format = infoValue(infoText, 'format')?.toLowerCase() ?? null;
  const chartEntry = (chartName ? zip.file(chartName) : null)
    ?? entries.find((entry) => /\.(json|pec|pbc)$/i.test(entry.name));
  if (!chartEntry) throw new Error('谱面包中没有可读取的谱面文件');
  // 不把取消检查作为进度回调传入：JSZip 的 data 回调运行在自有流机件（setImmediate）里，
  // 在回调中 throw 不会 reject 该 Promise，而是穿透为全局未捕获异常（RN 打 ERROR 日志）。
  // 取消语义仅由每个 await 之后的顶层 throwIfAborted 承担。
  const bytes = await chartEntry.async('uint8array');
  throwIfAborted(signal);
  if (format === 'pbc' || /\.pbc$/i.test(chartEntry.name)) return countPbcNotes(bytes);
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (format === 'pec' || /\.pec$/i.test(chartEntry.name) || !text.trimStart().startsWith('{')) return countPecNotes(text);
  const json = JSON.parse(text) as unknown;
  return format === 'rpe' || text.includes('"META"') ? countRpeNotes(json) : countPgrNotes(json);
}
