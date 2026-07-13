export interface VersionNameMapping {
  versionId: number;
  china: string;
  japan: string;
}

export type VersionNameLocale = 'china' | 'japan';

// 2026-07-13 由 LXNS /song/list 与水鱼 /music_data 的发布曲目交叉统计核实。
export const VERSION_NAME_MAPPINGS: readonly VersionNameMapping[] = [
  { versionId: 10000, china: 'maimai', japan: 'maimai' },
  { versionId: 11000, china: 'maimai PLUS', japan: 'maimai PLUS' },
  { versionId: 12000, china: 'GreeN', japan: 'maimai GreeN' },
  { versionId: 13000, china: 'GreeN PLUS', japan: 'maimai GreeN PLUS' },
  { versionId: 14000, china: 'ORANGE', japan: 'maimai ORANGE' },
  { versionId: 15000, china: 'ORANGE PLUS', japan: 'maimai ORANGE PLUS' },
  { versionId: 16000, china: 'PiNK', japan: 'maimai PiNK' },
  { versionId: 17000, china: 'PiNK PLUS', japan: 'maimai PiNK PLUS' },
  { versionId: 18000, china: 'MURASAKi', japan: 'maimai MURASAKi' },
  { versionId: 18500, china: 'MURASAKi PLUS', japan: 'maimai MURASAKi PLUS' },
  { versionId: 19000, china: 'MiLK', japan: 'maimai MiLK' },
  { versionId: 19500, china: 'MiLK PLUS', japan: 'MiLK PLUS' },
  { versionId: 19900, china: 'FiNALE', japan: 'maimai FiNALE' },
  { versionId: 20000, china: '舞萌DX', japan: 'maimai でらっくす' },
  { versionId: 21000, china: '舞萌DX 2021', japan: 'maimai でらっくす Splash' },
  { versionId: 22000, china: '舞萌DX 2022', japan: 'maimai でらっくす UNiVERSE' },
  { versionId: 23000, china: '舞萌DX 2023', japan: 'maimai でらっくす FESTiVAL' },
  { versionId: 24000, china: '舞萌DX 2024', japan: 'maimai でらっくす BUDDiES' },
  { versionId: 25000, china: '舞萌DX 2025', japan: 'maimai でらっくす PRiSM' },
  { versionId: 25500, china: '舞萌DX 2026', japan: 'maimai でらっくす PRiSM PLUS' },
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
