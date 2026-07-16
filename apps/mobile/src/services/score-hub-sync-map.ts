import { normalizeSongId } from '@/domain/catalog';
import type { CatalogSnapshot } from '@/domain/models';
import type { ScoreHubSyncScore } from '@/services/score-hub-client';

export type DivingFishUploadRecord = {
  achievements: number;
  dxScore: number | null;
  fc: string | null;
  fs: string | null;
  level_index: number;
  title: string;
  type: 'SD' | 'DX';
};

export type SyncMapResult = {
  records: DivingFishUploadRecord[];
  skippedNoTitle: number;
  skippedBadScore: number;
  skippedUnsupportedChart: number;
};

/** 解析 hub 的 `"100.2618%"` / 数值为达成率。 */
export function parseHubAchievement(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withoutPercent = trimmed.endsWith('%') ? trimmed.slice(0, -1) : trimmed;
  const parsed = Number(withoutPercent);
  return Number.isFinite(parsed) ? parsed : null;
}

export function mapHubTypeToDivingFish(type: string): 'SD' | 'DX' {
  const normalized = type.trim().toLowerCase();
  if (normalized === 'standard' || normalized === 'sd') return 'SD';
  return 'DX';
}

function toNumber(value: string | number | null | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** 用曲库构建 musicId → title；兼容 DX 偏移 id。 */
export function buildMusicTitleMap(catalog: CatalogSnapshot): Map<string, string> {
  const map = new Map<string, string>();
  for (const song of catalog.songs) {
    map.set(song.id, song.title);
    map.set(normalizeSongId(song.id), song.title);
    const numeric = Number(song.id);
    if (Number.isSafeInteger(numeric) && numeric > 0 && numeric < 10000) {
      map.set(String(numeric + 10000), song.title);
    }
  }
  return map;
}

function lookupTitle(musicId: string, titleMap: Map<string, string>): string | null {
  return titleMap.get(musicId)
    ?? titleMap.get(normalizeSongId(musicId))
    ?? null;
}

export function convertHubScoresToDivingFishRecords(
  scores: readonly ScoreHubSyncScore[],
  titleMap: Map<string, string>,
): SyncMapResult {
  const records: DivingFishUploadRecord[] = [];
  let skippedNoTitle = 0;
  let skippedBadScore = 0;
  let skippedUnsupportedChart = 0;

  for (const score of scores) {
    const normalizedType = score.type.trim().toLowerCase();
    if (!Number.isInteger(score.chartIndex) || score.chartIndex < 0 || score.chartIndex > 4
      || (normalizedType !== 'standard' && normalizedType !== 'sd' && normalizedType !== 'dx')) {
      skippedUnsupportedChart += 1;
      continue;
    }
    const title = lookupTitle(String(score.musicId), titleMap);
    if (!title) {
      skippedNoTitle += 1;
      continue;
    }
    const achievements = parseHubAchievement(score.score);
    if (achievements === null) {
      skippedBadScore += 1;
      continue;
    }
    records.push({
      achievements,
      dxScore: toNumber(score.dxScore),
      fc: score.fc ?? null,
      fs: score.fs ?? null,
      level_index: score.chartIndex,
      title,
      type: mapHubTypeToDivingFish(score.type),
    });
  }

  return { records, skippedNoTitle, skippedBadScore, skippedUnsupportedChart };
}
