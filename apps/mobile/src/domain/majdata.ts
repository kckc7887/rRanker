import { z } from 'zod';
import type { DataSource } from './models';

export const MAJDATA_BASE = 'https://majdata.net/api3/api';
export const MAJDATA_ORDER = [5, 4, 3, 2, 1, 0, 6] as const;
export const MAJDATA_NAMES = ['Easy', 'Basic', 'Advanced', 'Expert', 'Master', 'Re:Master', '宴谱'] as const;
export const MAJDATA_SORTS = [
  { value: 'timep', label: '发布时间' }, { value: '', label: '最新互动' }, { value: 'likep', label: '点赞数' },
  { value: 'commp', label: '评论数' }, { value: 'playp', label: '游玩次数' },
] as const;
export const MajdataSongSchema = z.object({
  id: z.string().min(1), title: z.string(), artist: z.string().nullish().transform(v => v ?? ''),
  designer: z.string().nullish().transform(v => v ?? ''), uploader: z.string().default(''),
  description: z.string().default(''), timestamp: z.string(), hash: z.string(),
  levels: z.array(z.string().nullable()).transform(values => values.slice(0, 7).map(v => v ?? '')),
  tags: z.array(z.string()).default([]), publicTags: z.array(z.string()).default([]),
});
export const MajdataScoreSchema = z.object({
  acc: z.object({ dx: z.number().finite(), classic: z.number().finite() }), dxScore: z.number().finite(),
  comboState: z.coerce.number().int().min(0).max(4), chartLevel: z.number().int().min(0).max(6),
  hash: z.string(), chartInfo: MajdataSongSchema, timestamp: z.string(),
});
export const MajdataRecentSchema = z.object({
  chartId: z.string(), title: z.string(), artist: z.string().default(''), uploader: z.string().default(''),
  designer: z.string().default(''), level: z.coerce.number().int().min(0).max(6), difficulty: z.string(),
  acc: z.number().finite(), comboState: z.coerce.number().int().min(0).max(4), timestamp: z.string().nullish(),
});
export const MajdataRankingSchema = z.object({ hash: z.string().optional(), scores: z.array(z.array(z.object({
  player: z.object({ username: z.string() }), acc: z.number(), comboState: z.coerce.number(),
}))) });
export type MajdataSong = z.infer<typeof MajdataSongSchema>;
export type MajdataScore = z.infer<typeof MajdataScoreSchema>;
export type MajdataRecent = z.infer<typeof MajdataRecentSchema>;
export type MajdataRanking = z.infer<typeof MajdataRankingSchema>;
export type MajdataSnapshot = { player: { username: string }; records: MajdataScore[]; recent: MajdataRecent[]; source: DataSource };
export type MajdataFilters = { difficulties: number[]; tags: string[]; min: string; max: string; keyword: string; sort: string };
export const MAJDATA_FILTER_DEFAULTS: MajdataFilters = { difficulties: [], tags: [], min: '', max: '', keyword: '', sort: 'timep' };
export function majdataAsset(id: string, asset: 'summary' | 'chart' | 'track' | 'image' | 'video' | 'score', full = false) {
  return `${MAJDATA_BASE}/maichart/${encodeURIComponent(id)}/${asset}${full ? '?fullImage=true' : ''}`;
}
export function majdataTags(song: MajdataSong): string[] { return [...new Set([...song.tags, ...song.publicTags])]; }
export function majdataDefaultDifficulty(song: MajdataSong, requested?: number): number | undefined {
  return requested !== undefined && song.levels[requested]?.trim() ? requested : MAJDATA_ORDER.find(i => song.levels[i]?.trim());
}
export function majdataTime(value?: string | null): number {
  if (!value) return 0;
  const time = Date.parse(value); return Number.isFinite(time) ? time : 0;
}
export function majdataTotals(records: readonly MajdataScore[]) {
  return records.reduce((sum, score) => ({ dx: sum.dx + score.acc.dx, classic: sum.classic + score.acc.classic }), { dx: 0, classic: 0 });
}
export function majdataTotal(records: readonly MajdataScore[]): number {
  const totals = majdataTotals(records);
  return totals.dx + totals.classic;
}
export function majdataTotalText(snapshot: MajdataSnapshot): string {
  return `${majdataTotal(snapshot.records).toFixed(4)}%`;
}
export function majdataAvatarUrl(username: string): string {
  return `${MAJDATA_BASE}/account/Icon?username=${encodeURIComponent(username)}`;
}
/** 兼容首版账号摘要，原快照与账号身份不变。 */
export function normalizeMajdataTotalDisplay(display: string): string {
  const pair = /^(\d+(?:\.\d+)?)% · (\d+(?:\.\d+)?)%$/.exec(display);
  return pair ? `${(Number(pair[1]) + Number(pair[2])).toFixed(4)}%` : display;
}
export function majdataRank(ranking: MajdataRanking | undefined, username: string, level: number, hash?: string): number | undefined {
  if (hash && ranking?.hash && ranking.hash !== hash) return undefined;
  const index = ranking?.scores[level]?.findIndex(s => s.player.username.trim().toLowerCase() === username.trim().toLowerCase());
  return index !== undefined && index >= 0 ? index + 1 : undefined;
}
export function matchesMajdataSong(song: MajdataSong, filters: MajdataFilters, level?: number): boolean {
  if (filters.difficulties.length && !(level === undefined ? filters.difficulties.some(i => song.levels[i]?.trim()) : filters.difficulties.includes(level))) return false;
  if (filters.tags.length && !filters.tags.some(tag => majdataTags(song).includes(tag))) return false;
  const query = filters.keyword.trim().toLocaleLowerCase();
  return !query || `${song.id} ${song.title} ${song.artist} ${song.designer}`.toLocaleLowerCase().includes(query);
}
export function filterMajdataRecords(records: readonly MajdataScore[], filters: MajdataFilters): MajdataScore[] {
  return records.filter(score => matchesMajdataSong(score.chartInfo, filters, score.chartLevel)
    && (filters.min === '' || score.acc.dx >= Number(filters.min)) && (filters.max === '' || score.acc.dx <= Number(filters.max)))
    .sort((a, b) => b.acc.dx - a.acc.dx || majdataTime(b.timestamp) - majdataTime(a.timestamp) || a.chartInfo.id.localeCompare(b.chartInfo.id) || a.chartLevel - b.chartLevel);
}

export const MAJDATA_DIFFICULTIES = ['unknown', 'basic', 'advanced', 'expert', 'master', 'remaster', 'utage'] as const;
