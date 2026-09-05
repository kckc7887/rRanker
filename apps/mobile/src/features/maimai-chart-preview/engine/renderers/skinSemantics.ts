/** Runtime sprite contract; object names are immutable S3 keys.
 * All sprites use the full image rectangle, center pivot, and 100 pixels/world unit.
 * Native alpha bounds and dimensions are recorded in the audited manifest. */
export const SKIN_ALIASES: Readonly<Record<string, string>> = {
  'TouchHoldSkins/touchhold_mine_border.png': 'TouchHoldSkins/touchhold_break_mine.png',
};
export const resolveSkinObject = (semantic: string): string => SKIN_ALIASES[semantic] ?? semantic;
export const SKIN_TRANSFORM = {
  pixelsPerUnit: 100,
  pivot: [0.5, 0.5] as const,
  holdSlice: [0.29, 0.29] as const,
  // Image y grows down; ViewX world y and angles grow counterclockwise.
  canvasYSign: -1,
  canvasAngleSign: -1,
  touchPetalDegrees: [90, 180, 270, 360],
  touchHoldPetalDegrees: [135, 45, -45, -135],
} as const;
