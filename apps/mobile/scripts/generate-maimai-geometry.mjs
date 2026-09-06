import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const input = JSON.parse(await fs.readFile(path.join(root, 'build/maimai-reference/geometry.json'), 'utf8'));
const pose = p => [p.X, p.Y, p.RotZ, p.L];
const entries = Object.fromEntries(Object.entries(input).map(([key, v]) => [key, [v.SlideConst, v.SlideLength, v.ConditionalLastArrow, pose(v.OkPose), v.OkType, v.ArrowPoses.map(pose), v.JudgeAreaQueue.map(a => [a.ArrowProgressPush, a.ArrowProgressFinish, a.SensorA, a.SensorB])]]));
const lookup = JSON.parse(await fs.readFile(path.join(root, 'build/maimai-reference/geometry.json.areas.json'), 'utf8'));
const areas = Object.fromEntries(Object.entries(lookup).map(([key, v]) => [key, v.map(a => [a.LengthAfterPush, a.LengthAfterFinish, a.SensorA, a.SensorB])]));
const out = path.join(root, 'src/features/maimai-chart-preview/engine/core/geometry');
await fs.mkdir(out, { recursive: true });
const header = '/** Generated from MajdataViewX SlideTableNeo / SlideDataBuilder (GPL-3.0).\n * Reproduce with scripts/maimai-reference and generate-maimai-geometry.mjs. */\n';
const numbers = [], numberIndexes = new Map();
function pack(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Non-finite geometry value');
    const key = Object.is(value, -0) ? '-0' : String(value);
    if (!numberIndexes.has(key)) { numberIndexes.set(key, numbers.length); numbers.push(value); }
    return numberIndexes.get(key);
  }
  if (Array.isArray(value)) return value.map(pack);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, pack(child)]));
  return value;
}
const packed = pack({ SLIDE_TABLE: entries, AREA_LOOKUP: areas });
const restore = `
// Restore in place once; the numeric dictionary is not retained by the renderer.
function restoreNumbers(value: unknown, numbers: readonly number[]): unknown {
  if (typeof value === 'number') return numbers[value];
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = restoreNumbers(value[i], numbers);
  } else if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) record[key] = restoreNumbers(record[key], numbers);
  }
  return value;
}
`;
const numberJson = '[' + numbers.map(value => Object.is(value, -0) ? '-0' : JSON.stringify(value)).join(',') + ']';
await fs.writeFile(path.join(out, 'slideTable.generated.ts'), `${header}${restore}export const { SLIDE_TABLE, AREA_LOOKUP } = restoreNumbers(${JSON.stringify(packed)}, ${numberJson}) as {
  SLIDE_TABLE: Record<string, [number, number, boolean, number[], number, number[][], number[][]]>;
  AREA_LOOKUP: Record<string, number[][]>;
};\n`);
console.log(`Generated ${Object.keys(entries).length} slide paths and ${Object.keys(areas).length} area transitions`);
