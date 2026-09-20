type Point = { x: number; y: number };
type ToCanvas = (x: number, y: number) => readonly [number, number];

/** Solid track and slim outline, using the engine's sampled path and coordinate transform. */
export function buildFlatSliderBody(
  path: readonly Point[], radius: number, borderColor: string, trackColor: string,
  quality: number, toCanvas: ToCanvas,
): { bmp: OffscreenCanvas; ox: number; oy: number; w: number; h: number } | null {
  if (path.length < 2 || !Number.isFinite(radius) || radius <= 0 || !Number.isFinite(quality) || quality <= 0) return null;
  const points = path.map(point => toCanvas(point.x, point.y));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }

  // Preserve the upstream integer-aligned cache bounds and density. No shadow is painted.
  const pad = radius + 2;
  const ox = Math.floor(minX - pad), oy = Math.floor(minY - pad);
  const w = Math.ceil(maxX + pad) - ox, h = Math.ceil(maxY + pad) - oy;
  const bmp = new OffscreenCanvas(Math.ceil(w * quality), Math.ceil(h * quality));
  const ctx = bmp.getContext('2d');
  if (!ctx) throw new Error('无法准备滑条画面');
  ctx.scale(quality, quality);
  ctx.beginPath();
  ctx.moveTo(Math.fround(points[0]![0]) - ox, Math.fround(points[0]![1]) - oy);
  for (const [x, y] of points.slice(1)) ctx.lineTo(Math.fround(x) - ox, Math.fround(y) - oy);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 59/64 is the canonical visible hit-circle radius; heads, tails and track stay aligned.
  const outerRadius = radius * 59 / 64;
  const outline = radius * 3 / 64;
  ctx.lineWidth = outerRadius * 2;
  ctx.strokeStyle = borderColor;
  ctx.stroke();
  ctx.lineWidth = (outerRadius - outline) * 2;
  ctx.strokeStyle = trackColor;
  ctx.stroke();
  return { bmp, ox, oy, w, h };
}
