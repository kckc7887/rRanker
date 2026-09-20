type Tap = { offset: number; weight: number };

function gaussianTaps(sigma: number): Tap[] {
  const radius = Math.ceil(sigma * 3);
  const weights = Array.from({ length: radius + 1 }, (_, index) => Math.exp(-index * index / (2 * sigma * sigma)));
  const total = weights[0]! + weights.slice(1).reduce((sum, weight) => sum + weight * 2, 0);
  const taps: Tap[] = [{ offset: 0, weight: weights[0]! / total }];
  // Adjacent texels share one bilinear sample; all weights still sum to one.
  for (let index = 1; index <= radius; index += 2) {
    const first = weights[index]!, second = weights[index + 1] ?? 0;
    const weight = first + second;
    const offset = (index * first + (index + 1) * second) / weight;
    taps.push({ offset, weight: weight / total }, { offset: -offset, weight: weight / total });
  }
  return taps;
}

function supportsCanvasBlur(): boolean {
  const probe = document.createElement('canvas');
  probe.width = probe.height = 18;
  try {
    const ctx = probe.getContext('2d', { willReadFrequently: true });
    if (!ctx || !('filter' in ctx)) return false;
    ctx.filter = 'blur(2px)';
    ctx.fillStyle = '#fff';
    ctx.fillRect(8, 8, 2, 2);
    // Some engines accept the property without applying it. Read only our own tiny,
    // origin-clean probe; never read pixels from map images, storyboards or video.
    const outside = ctx.getImageData(6, 8, 1, 1).data[3]!;
    const inside = ctx.getImageData(8, 8, 1, 1).data[3]!;
    return outside > 0 && inside > outside && inside < 255;
  } catch {
    return false;
  } finally {
    probe.width = probe.height = 0;
  }
}

export class PreviewBackgroundBlur {
  private native: boolean | undefined;
  private horizontal: HTMLCanvasElement | null = null;
  private result: HTMLCanvasElement | null = null;
  private key = '';
  private tapsKey = '';
  private horizontalTaps: Tap[] = [];
  private verticalTaps: Tap[] = [];

  draw(ctx: CanvasRenderingContext2D, source: HTMLCanvasElement, radius: number, revision: number): void {
    this.native ??= supportsCanvasBlur();
    if (this.native) {
      ctx.save();
      ctx.filter = `blur(${radius}px)`;
      ctx.drawImage(source, 0, 0);
      ctx.restore();
      return;
    }

    // Canvas filters use output bitmap pixels, independently of the draw transform.
    const outputWidth = ctx.canvas.width, outputHeight = ctx.canvas.height;
    const logicalRadius = Math.max(radius * source.width / outputWidth, radius * source.height / outputHeight);
    const downsample = Math.max(1, logicalRadius / 2);
    const width = Math.ceil(source.width / downsample), height = Math.ceil(source.height / downsample);
    const key = `${revision}:${radius}:${outputWidth}:${outputHeight}:${source.width}:${source.height}`;
    if (key !== this.key) {
      this.horizontal ??= document.createElement('canvas');
      this.result ??= document.createElement('canvas');
      for (const canvas of [this.horizontal, this.result]) {
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      }
      const horizontal = this.horizontal.getContext('2d')!, result = this.result.getContext('2d')!;
      const sigmaX = radius * width / outputWidth, sigmaY = radius * height / outputHeight;
      const tapsKey = `${sigmaX}:${sigmaY}`;
      if (tapsKey !== this.tapsKey) {
        this.horizontalTaps = gaussianTaps(sigmaX);
        this.verticalTaps = gaussianTaps(sigmaY);
        this.tapsKey = tapsKey;
      }
      result.clearRect(0, 0, width, height);
      result.imageSmoothingEnabled = true;
      result.imageSmoothingQuality = 'high';
      result.drawImage(source, 0, 0, width, height);
      const convolve = (target: CanvasRenderingContext2D, input: HTMLCanvasElement, taps: Tap[], vertical: boolean): void => {
        target.save();
        target.clearRect(0, 0, width, height);
        target.imageSmoothingEnabled = true;
        target.imageSmoothingQuality = 'low';
        target.globalCompositeOperation = 'lighter';
        for (const tap of taps) {
          target.globalAlpha = tap.weight;
          target.drawImage(input, vertical ? 0 : tap.offset, vertical ? tap.offset : 0);
        }
        target.restore();
      };
      convolve(horizontal, this.result, this.horizontalTaps, false);
      convolve(result, this.horizontal, this.verticalTaps, true);
      this.key = key;
    }
    ctx.drawImage(this.result!, 0, 0, source.width, source.height);
  }

  dispose(): void {
    if (this.horizontal) this.horizontal.width = this.horizontal.height = 0;
    if (this.result) this.result.width = this.result.height = 0;
    this.horizontal = this.result = null;
    this.key = this.tapsKey = '';
    this.horizontalTaps = this.verticalTaps = [];
  }
}
