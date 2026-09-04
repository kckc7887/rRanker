import {
  maimaiChartPreviewRuntimeSkinAssets,
  maimaiChartPreviewSkinStagePath,
} from '../../maimai-chart-preview-skin-files';
import { canvasSizeFromNativePx } from '../utils/arcadeMotion';

const IMAGE_LOAD_CONCURRENCY = 4;

export class ChartPreviewSkin {
  private readonly images = new Map<string, HTMLImageElement>();
  ready = false;

  get(path: string): HTMLImageElement | undefined {
    const image = this.images.get(path);
    if (!image || !image.complete || image.naturalWidth === 0) return undefined;
    return image;
  }

  async load(base = './'): Promise<void> {
    const prefix = base.endsWith('/') ? base : `${base}/`;
    const assets = maimaiChartPreviewRuntimeSkinAssets();
    for (let index = 0; index < assets.length; index += IMAGE_LOAD_CONCURRENCY) {
      const batch = assets.slice(index, index + IMAGE_LOAD_CONCURRENCY);
      await Promise.all(batch.map((asset) => this.loadOne(
        `${prefix}${maimaiChartPreviewSkinStagePath(asset.path)}`,
        asset.path,
      )));
    }
    this.ready = true;
  }

  private loadOne(url: string, path: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        this.images.set(path, image);
        resolve();
      };
      image.onerror = () => reject(new Error(`皮肤缺失：${path}`));
      image.src = url;
    });
  }
}

export function drawSkinSprite(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  radius: number,
  options: { scale?: number; rotation?: number; alpha?: number; displayWidth?: number; displayHeight?: number } = {},
): void {
  const scale = options.scale ?? 1;
  const alpha = options.alpha ?? 1;
  const width = (options.displayWidth ?? canvasSizeFromNativePx(image.naturalWidth, radius)) * scale;
  const height = (options.displayHeight ?? canvasSizeFromNativePx(image.naturalHeight, radius)) * scale;
  ctx.save();
  ctx.translate(x, y);
  if (options.rotation) ctx.rotate(options.rotation);
  ctx.globalAlpha *= alpha;
  ctx.drawImage(image, -width / 2, -height / 2, width, height);
  ctx.restore();
}

export function tapSkinPath(isBreak: boolean, isEach: boolean): string {
  if (isBreak) return 'TapSkins/tap_break.png';
  if (isEach) return 'TapSkins/tap_each.png';
  return 'TapSkins/tap.png';
}

export function starSkinPath(isBreak: boolean, isEach: boolean, isDouble: boolean, pink: boolean): string {
  if (isBreak) return isDouble ? 'StarSkins/star_break_double.png' : 'StarSkins/star_break.png';
  if (isEach) return isDouble ? 'StarSkins/star_each_double.png' : 'StarSkins/star_each.png';
  if (pink) return isDouble ? 'StarSkins/star_each_double.png' : 'StarSkins/star.png';
  return isDouble ? 'StarSkins/star_double.png' : 'StarSkins/star.png';
}

export function holdSkinPath(isBreak: boolean, isEach: boolean, on: boolean): string {
  if (on) {
    if (isBreak) return 'HoldSkins/hold_break_on.png';
    if (isEach) return 'HoldSkins/hold_each_on.png';
    return 'HoldSkins/hold_on.png';
  }
  if (isBreak) return 'HoldSkins/hold_break.png';
  if (isEach) return 'HoldSkins/hold_each.png';
  return 'HoldSkins/hold.png';
}

export function slideSkinPath(isBreak: boolean, isEach: boolean, normalBreakColor: boolean): string {
  if (isBreak && !normalBreakColor) return 'SlideSkins/slide_break.png';
  if (isEach) return 'SlideSkins/slide_each.png';
  return 'SlideSkins/slide.png';
}

export function wifiSkinPath(index: number, isBreak: boolean, isEach: boolean, normalBreakColor: boolean): string {
  const i = Math.min(10, Math.max(0, index));
  if (isBreak && !normalBreakColor) return `WifiSkins/wifi_break_${i}.png`;
  if (isEach) return `WifiSkins/wifi_each_${i}.png`;
  return `WifiSkins/wifi_${i}.png`;
}

export function touchSkinPath(isBreak: boolean, isEach: boolean): string {
  if (isBreak) return 'TouchSkins/touch_break.png';
  if (isEach) return 'TouchSkins/touch_each.png';
  return 'TouchSkins/touch.png';
}

export function touchPointSkinPath(isBreak: boolean, isEach: boolean): string {
  if (isBreak) return 'TouchSkins/touch_break_point.png';
  if (isEach) return 'TouchSkins/touch_point_each.png';
  return 'TouchSkins/touch_point.png';
}

export function touchBorderSkinPath(count: number, isBreak: boolean, isEach: boolean): string | null {
  if (count < 2) return null;
  const n = count >= 3 ? 3 : 2;
  if (isBreak) return `TouchSkins/touch_break_border_${n}.png`;
  if (isEach) return `TouchSkins/touch_border_${n}_each.png`;
  return `TouchSkins/touch_border_${n}.png`;
}

export function eachLineSkinPath(span: 1 | 2 | 3 | 4): string {
  return `NoteGuideSkins/EachLine${span}.png`;
}

export function guideSkinPath(kind: 'normal' | 'each' | 'break' | 'slide'): string {
  if (kind === 'each') return 'NoteGuideSkins/Each.png';
  if (kind === 'break') return 'NoteGuideSkins/Break.png';
  if (kind === 'slide') return 'NoteGuideSkins/Slide.png';
  return 'NoteGuideSkins/Normal.png';
}

export function holdEndSkinPath(isBreak: boolean, isEach: boolean): string {
  if (isBreak) return 'NoteGuideSkins/Hold_Break_End.png';
  if (isEach) return 'NoteGuideSkins/Hold_Each_End.png';
  return 'NoteGuideSkins/Hold_End.png';
}
