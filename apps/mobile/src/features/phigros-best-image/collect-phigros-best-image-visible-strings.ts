import type { PhigrosBestImagePage, PhigrosBestImageType } from './phigros-best-image';

const FIXED_UI_STRINGS = [
  'rRanker',
  '无法推分',
  'OVER FLOW',
  'Avg: ',
  'EZ', 'HD', 'IN', 'AT',
  'C', 'FC', 'Phi', '\\',
  '%',
  '未知',
] as const;

export type PhigrosBestImageFontTextInput = {
  type: PhigrosBestImageType;
  playerName: string;
  rks: string;
  dataAmount: string;
  challenge: string;
  syncedAt: string;
  titles: Readonly<Record<string, string>>;
  pages: readonly PhigrosBestImagePage[];
};

/** 收集成绩图可见文本，供按脚本筛选扩展字体。 */
export function collectPhigrosBestImageVisibleStrings(input: PhigrosBestImageFontTextInput): string[] {
  const values: string[] = [
    ...FIXED_UI_STRINGS,
    input.playerName,
    input.rks,
    input.dataAmount,
    input.challenge,
    input.syncedAt,
  ];
  for (const page of input.pages) {
    for (const section of page.sections) {
      for (const record of section.records) {
        values.push(input.titles[record.songId] ?? record.title ?? record.songId);
        values.push(record.level);
        values.push(String(Math.round(record.dxScore ?? 0)));
        values.push(record.achievements.toFixed(2));
        values.push(record.difficultyConstant.toFixed(1));
        values.push(record.rating.toFixed(2));
      }
    }
  }
  return values;
}
