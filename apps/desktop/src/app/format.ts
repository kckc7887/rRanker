import { mapCoverId, type Difficulty, type ScoreRecord } from '@rranker/core';

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  basic: 'BASIC',
  advanced: 'ADVANCED',
  expert: 'EXPERT',
  master: 'MASTER',
  remaster: 'Re:MASTER',
  unknown: 'UNKNOWN',
};

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '未知';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatDxScore(record: ScoreRecord): string {
  return record.dxScore === null ? '—' : record.dxScore.toLocaleString('zh-CN');
}

export function coverUrl(songId: string): string {
  const numeric = Number(songId);
  const mapped = Number.isSafeInteger(numeric) ? mapCoverId(numeric) : songId;
  return `https://assets2.lxns.net/maimai/jacket/${encodeURIComponent(String(mapped))}.png`;
}
