// Extract original Unity animation curves. GPL-3.0; see THIRD_PARTY_NOTICES.md.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import YAML from 'yaml';
const sourceRoot = path.resolve(import.meta.dirname, 'maimai-reference/Effects');
const root = sourceRoot + '/Animation/';
const files = { tap: 'Effect/NoteEffect/TapPerfect.anim', break: 'Effect/NoteEffect/BreakPerfect.anim', touch: 'Effect/TouchEffect/TouchPerfect.anim', firework: 'Hanabi/Fire.anim', judge: 'Effect/JudgeEffect/JudgePerfect.anim', judgeBreak: 'Effect/JudgeEffect/JudgeBreak.anim' };
const output = {};
const clips = {};
for (const [name, file] of Object.entries(files)) {
  const source = fs.readFileSync(root + file, 'utf8').replace(/^%.*\r?\n/gm, '').replace(/--- !u!\d+ &\d+/, '---');
  const clip = YAML.parse(source).AnimationClip, curves = {};
  clips[name] = clip;
  for (const [field, prefix] of [['m_ScaleCurves', 'scale'], ['m_PositionCurves', 'position'], ['m_EulerCurves', 'rotation']]) {
    for (const c of clip[field]) for (const axis of ['x', 'y', 'z']) {
      curves[`${c.path ?? ''}:${prefix}.${axis}`] = c.curve.m_Curve.map(k => [k.time, k.value[axis], k.inSlope[axis], k.outSlope[axis]]);
    }
  }
  for (const c of clip.m_FloatCurves) curves[`${c.path ?? ''}:${c.attribute}`] = c.curve.m_Curve.map(k => [k.time, k.value, k.inSlope, k.outSlope].map(v => Number.isFinite(v) ? v : null));
  output[name] = { duration: clip.m_AnimationClipSettings.m_StopTime, curves };
}
fs.writeFileSync('src/features/maimai-chart-preview/engine/renderers/effectCurves.generated.ts', `// Generated from MajdataViewX Unity animations (GPL-3.0); do not edit.\nexport const EFFECT_CURVES: Record<string, { duration: number; curves: Record<string, (number | null)[][]> }> = ${JSON.stringify(output)};\n`);

const spritesByGuid = new Map(), sprites = {};
for (const file of fs.readdirSync(sourceRoot + '/Sprites/Effect').filter(f => f.endsWith('.png'))) {
  const bytes = fs.readFileSync(sourceRoot + '/Sprites/Effect/' + file);
  const meta = YAML.parse(fs.readFileSync(sourceRoot + '/Sprites/Effect/' + file + '.meta', 'utf8'));
  const importer = meta.TextureImporter;
  spritesByGuid.set(meta.guid, file);
  sprites[file] = { data: 'data:image/png;base64,' + bytes.toString('base64'), width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), ppu: importer.spritePixelsToUnits, pivot: importer.spritePivot, sha256: createHash('sha256').update(bytes).digest('hex') };
}
function documents(file) {
  const text = fs.readFileSync(sourceRoot + '/' + file, 'utf8');
  return [...text.matchAll(/--- !u!\d+ &(-?\d+)\r?\n([\s\S]*?)(?=--- !u!|$)/g)].map(m => ({ id: m[1], ...YAML.parse(m[2].replace(/fileID: (-?\d+)/g, "fileID: '$1'")) }));
}
const scenes = {};
for (const [name, file] of Object.entries({ tap: 'Prefab/Effect/TapPerfect.prefab', break: 'Prefab/Effect/TapPerfect.prefab', touch: 'Prefab/Effect/TouchPerfect.prefab', firework: 'Prefab/Firework.prefab' })) {
  const docs = documents(file), transforms = docs.filter(d => d.Transform), nodes = [];
  const paths = new Map();
  function nodePath(d) {
    if (paths.has(d.id)) return paths.get(d.id);
    const parent = transforms.find(p => p.id === d.Transform.m_Father.fileID);
    const object = docs.find(o => o.id === d.Transform.m_GameObject.fileID).GameObject;
    const result = parent ? [nodePath(parent), object.m_Name].filter(Boolean).join('/') : '';
    paths.set(d.id, result); return result;
  }
  for (const d of transforms) {
    const t = d.Transform, nodePathValue = nodePath(d), renderer = docs.find(r => r.SpriteRenderer?.m_GameObject.fileID === t.m_GameObject.fileID)?.SpriteRenderer;
    const parent = transforms.find(p => p.id === t.m_Father.fileID);
    const spriteCurve = clips[name].m_PPtrCurves?.find(c => c.path === nodePathValue && c.attribute === 'm_Sprite');
    const sprite = spritesByGuid.get(spriteCurve?.curve[0]?.value.guid ?? renderer?.m_Sprite.guid);
    nodes.push({ path: nodePathValue, parent: parent ? nodePath(parent) : null, position: t.m_LocalPosition, scale: t.m_LocalScale, angle: Math.atan2(t.m_LocalRotation.z, t.m_LocalRotation.w) * 2 * 180 / Math.PI, sprite, color: renderer?.m_Color, order: renderer?.m_SortingOrder ?? 0, shader: name === 'firework' && nodePathValue === 'Firework' });
  }
  scenes[name] = nodes;
}
const hold = documents('Prefab/Effect/HoldEffect.prefab').find(d => d.ParticleSystem).ParticleSystem;
const keys = hold.SizeModule.curve.maxCurve.m_Curve.map(k => [k.time, k.value, k.inSlope, k.outSlope]);
const gradient = hold.ColorModule.gradient.maxGradient;
const holdData = { lifetime: hold.InitialModule.startLifetime.scalar, rate: hold.EmissionModule.rateOverTime.scalar, sizeMultiplier: hold.SizeModule.curve.scalar, size: keys, alpha: Array.from({ length: gradient.m_NumAlphaKeys }, (_, i) => [gradient['atime' + i] / 65535, gradient['key' + i].a]) };
const used = new Set(['Circle.png', ...Object.values(scenes).flatMap(nodes => nodes.map(n => n.sprite).filter(Boolean))]);
const selected = Object.fromEntries([...used].map(name => [name, sprites[name]]));
const types = `type Vec = { x: number; y: number; z: number };\nexport type EffectNode = { path: string; parent: string | null; position: Vec; scale: Vec; angle: number; sprite?: string; color?: { r: number; g: number; b: number; a: number }; order: number; shader: boolean };\n`;
fs.writeFileSync('src/features/maimai-chart-preview/engine/renderers/effectSprites.generated.ts', `/** Generated from MajdataViewX prefab/PNG sources, GPL-3.0. Copyright MajdataViewX contributors.\n * Adapted by rRanker 2026-09-05; see scripts/maimai-reference/Effects and THIRD_PARTY_NOTICES.md. */\n${types}export const EFFECT_SCENES: Record<string, EffectNode[]> = ${JSON.stringify(scenes)};\nexport const EFFECT_SPRITES: Record<string, { data: string; width: number; height: number; ppu: number; pivot: { x: number; y: number }; sha256: string }> = ${JSON.stringify(selected)};\nexport const HOLD_PARTICLES = ${JSON.stringify(holdData)};\n`);
console.log(`Generated ${used.size} effect sprites and ${Object.keys(scenes).length} prefab scenes`);
