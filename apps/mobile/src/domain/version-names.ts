export interface VersionNameMapping {
  versionId: number;
  china: string;
  japan: string;
  code: string;
}

export type VersionNameLocale = 'china' | 'japan';

// 2026-07-13 由 LXNS /song/list 与水鱼 /music_data 的发布曲目交叉统计核实。
export const VERSION_NAME_MAPPINGS: readonly VersionNameMapping[] = [
  { versionId: 10000, china: 'maimai', japan: 'maimai', code: '真' },
  { versionId: 11000, china: 'maimai PLUS', japan: 'maimai PLUS', code: '真' },
  { versionId: 12000, china: 'GreeN', japan: 'maimai GreeN', code: '超' },
  { versionId: 13000, china: 'GreeN PLUS', japan: 'maimai GreeN PLUS', code: '檄' },
  { versionId: 14000, china: 'ORANGE', japan: 'maimai ORANGE', code: '橙' },
  { versionId: 15000, china: 'ORANGE PLUS', japan: 'maimai ORANGE PLUS', code: '暁' },
  { versionId: 16000, china: 'PiNK', japan: 'maimai PiNK', code: '桃' },
  { versionId: 17000, china: 'PiNK PLUS', japan: 'maimai PiNK PLUS', code: '櫻' },
  { versionId: 18000, china: 'MURASAKi', japan: 'maimai MURASAKi', code: '紫' },
  { versionId: 18500, china: 'MURASAKi PLUS', japan: 'maimai MURASAKi PLUS', code: '菫' },
  { versionId: 19000, china: 'MiLK', japan: 'maimai MiLK', code: '白' },
  { versionId: 19500, china: 'MiLK PLUS', japan: 'MiLK PLUS', code: '雪' },
  { versionId: 19900, china: 'FiNALE', japan: 'maimai FiNALE', code: '輝' },
  { versionId: 20000, china: '舞萌DX', japan: 'maimai でらっくす', code: '熊' },
  { versionId: 21000, china: '舞萌DX 2021', japan: 'maimai でらっくす Splash', code: '爽' },
  { versionId: 22000, china: '舞萌DX 2022', japan: 'maimai でらっくす UNiVERSE', code: '宙' },
  { versionId: 23000, china: '舞萌DX 2023', japan: 'maimai でらっくす FESTiVAL', code: '祭' },
  { versionId: 24000, china: '舞萌DX 2024', japan: 'maimai でらっくす BUDDiES', code: '双' },
  { versionId: 25000, china: '舞萌DX 2025', japan: 'maimai でらっくす PRiSM', code: '鏡' },
  { versionId: 25500, china: '舞萌DX 2026', japan: 'maimai でらっくす PRiSM PLUS', code: '彩' },
];

export function localizedVersionName(
  versionId: number | undefined,
  currentName: string,
  locale: VersionNameLocale,
): string {
  const namedMapping = VERSION_NAME_MAPPINGS.find((item) =>
    item.china === currentName || item.japan === currentName);
  if (namedMapping) return namedMapping[locale];

  let mapping: VersionNameMapping | undefined;
  if (versionId !== undefined) {
    for (let index = 0; index < VERSION_NAME_MAPPINGS.length; index += 1) {
      const candidate = VERSION_NAME_MAPPINGS[index];
      const next = VERSION_NAME_MAPPINGS[index + 1];
      if (candidate.versionId === versionId ||
        (candidate.versionId < versionId && next !== undefined && versionId < next.versionId)) {
        mapping = candidate;
        break;
      }
    }
  }
  return mapping?.[locale] ?? currentName;
}
