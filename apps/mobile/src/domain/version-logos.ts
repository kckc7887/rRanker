import { VERSION_NAME_MAPPINGS } from './version-names';

/** 已准备国服/日服 Logo 的主版本 ID（与对照表一一对应）。 */
export const VERSION_IDS_WITH_LOGOS: readonly number[] = [
  10000, 11000, 12000, 13000, 14000, 15000, 16000, 17000, 18000, 18500,
  19000, 19500, 19900, 20000, 21000, 22000, 23000, 24000, 25000, 25500,
];

export function missingVersionLogoIds(): number[] {
  const ready = new Set(VERSION_IDS_WITH_LOGOS);
  return VERSION_NAME_MAPPINGS
    .map((item) => item.versionId)
    .filter((id) => !ready.has(id));
}
