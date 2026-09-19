export const CIRCLE_FEEDBACK_MS = 160;
export const DRUM_FEEDBACK_MS = 60;

/** A fixed-size ring at the original hit position. No travel, particles or scale punch. */
export function drawFlatCircleFeedback(
  ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, ageMs: number,
): void {
  if (ageMs < 0 || ageMs >= CIRCLE_FEEDBACK_MS || !Number.isFinite(ageMs) || radius <= 0) return;
  const width = radius * 3 / 64;
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha *= 0.6 * (1 - ageMs / CIRCLE_FEEDBACK_MS);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(x, y, radius * 59 / 64 - width / 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

type DrumAction = 'LeftCentre' | 'RightCentre' | 'LeftRim' | 'RightRim';

/** Both built-in textures are left halves, with the circle centre on their right edge. */
export function drawFlatInputDrum(
  ctx: CanvasRenderingContext2D, active: Readonly<Record<DrumAction, number>>, timeMs: number,
  images: ReadonlyMap<string, ImageBitmap> | undefined, x: number, y: number, width: number, height: number,
): void {
  if (!images) return;
  const draw = (stem: string, action: DrumAction, right: boolean): void => {
    const age = timeMs - active[action];
    if (!Number.isFinite(age) || age < 0 || age >= DRUM_FEEDBACK_MS) return;
    const image = images.get(`${stem}@2x.png`) ?? images.get(`${stem}.png`);
    if (!image || image.width <= 1 || image.height <= 1) return;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha *= 1 - age / DRUM_FEEDBACK_MS;
    ctx.translate(x + (right ? width : 0), y);
    if (right) ctx.scale(-1, 1);
    // Fit the exact half-box, independent of texture resolution or legacy skin-version offsets.
    ctx.drawImage(image, 0, 0, width / 2, height);
    ctx.restore();
  };
  draw('taiko-drum-outer', 'LeftRim', false);
  draw('taiko-drum-inner', 'LeftCentre', false);
  draw('taiko-drum-outer', 'RightRim', true);
  draw('taiko-drum-inner', 'RightCentre', true);
}
