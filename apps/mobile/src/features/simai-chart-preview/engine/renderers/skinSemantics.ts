/** 皮肤以图片中心为轴，默认密度为 100 像素/世界单位。 */
export const SKIN_ALIASES: Readonly<Record<string, string>> = {
  'TouchHoldSkins/touchhold_mine_border.png': 'TouchHoldSkins/touchhold_break_mine.png',
};
export const resolveSkinObject = (semantic: string): string => SKIN_ALIASES[semantic] ?? semantic;
export const EACH_COLOR = '#fff55d';
export function resolveStarSkin(path: string, pink: boolean): string {
  if (!pink) return path;
  if (path === 'StarSkins/star.png') return 'StarSkins/star_pink.png';
  if (path === 'StarSkins/star_double.png') return 'StarSkins/star_pink_double.png';
  return path;
}
/** 粉色素材分辨率不同，按原星星尺寸缩放。 */
export const SKIN_DISPLAY_SIZE: Readonly<Record<string, readonly [number, number]>> = {
  'StarSkins/star_pink.png': [1.26, 1.26],
  'StarSkins/star_pink_double.png': [1.22, 1.26],
};
/** 2048px sensor.webp 的 E 区中心对应半径 3.1。 */
export const SENSOR_TRANSFORM = { center: [1025.5, 997] as const, pixelsPerUnit: 197 } as const;
/** outline.png：100 PPU 下环半径 480px、线宽 6px、标记直径约 29px。 */
export const JUDGMENT_OUTLINE = { lineWidth: 0.06, markerRadius: 0.145 } as const;
export const SKIN_TRANSFORM = {
  pixelsPerUnit: 100,
  pivot: [0.5, 0.5] as const,
  holdSlice: [0.29, 0.29] as const,
  /** 图片 Y 向下；ViewX 的 Y 向上，角度逆时针。 */
  canvasYSign: -1,
  canvasAngleSign: -1,
  touchPetalDegrees: [90, 180, 270, 360],
  touchHoldPetalDegrees: [135, 45, -45, -135],
} as const;
