import type {
  PhiraBestSnapshot,
  PhiraPlayerSnapshot, PhiraQueriedBest,
} from '@/domain/phira';
import {
  PhiraUserSchema, PhiraUserStatsSchema, PhiraPoolSchema, PhiraRecordSchema, PhiraChartSchema,
  PHIRA_BEST_SCHEMA_VERSION, PHIRA_PLAYER_SCHEMA_VERSION, phiraBestCacheKey, phiraPlayerCacheKey,
} from '@/domain/phira';
import type { DataSource } from '@/domain/models';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { cacheSourceSchema, snapshotSource } from '@/services/snapshot-cache-utils';
import { z } from 'zod';

const sourceSchema = cacheSourceSchema('phira');
const playerSchema = z.object({
  player: PhiraUserSchema, stats: PhiraUserStatsSchema, pool: PhiraPoolSchema,
  recent: z.array(PhiraRecordSchema), seedCharts: z.array(PhiraChartSchema), source: sourceSchema,
});
const bestSchema = z.object({
  items: z.record(z.string(), z.object({
    chart: PhiraChartSchema, record: PhiraRecordSchema.nullable(),
    poolRks: z.number().finite().nullable(), queriedAt: z.string(),
  }).refine(item => item.record === null || item.record.chart === item.chart.id)),
  source: sourceSchema,
}).refine(value => Object.entries(value.items).every(([key, item]) => key === String(item.chart.id)));
export function phiraSource(updatedAt = new Date().toISOString()): DataSource {
  return snapshotSource({ kind: 'phira', label: 'Phira 社区公开数据' }, updatedAt);
}

export class PhiraCache {
  private readonly repository = new SqliteSnapshotRepository();
  async loadPlayer(id: number): Promise<PhiraPlayerSnapshot | null> {
    return this.repository.getResource(phiraPlayerCacheKey(id), PHIRA_PLAYER_SCHEMA_VERSION,
      playerSchema.refine(value => value.player.id === id));
  }
  savePlayer(id: number, value: PhiraPlayerSnapshot, assertCurrent?: () => void) { return this.repository.saveResource(phiraPlayerCacheKey(id), PHIRA_PLAYER_SCHEMA_VERSION, value.source.updatedAt, value, assertCurrent); }
  async loadBests(id: number): Promise<PhiraBestSnapshot | null> { return this.repository.getResource(phiraBestCacheKey(id), PHIRA_BEST_SCHEMA_VERSION, bestSchema); }
  saveBests(id: number, value: PhiraBestSnapshot, assertCurrent?: () => void) { return this.repository.saveResource(phiraBestCacheKey(id), PHIRA_BEST_SCHEMA_VERSION, value.source.updatedAt, value, assertCurrent); }
  async mergeBests(id: number, values: readonly PhiraQueriedBest[], assertCurrent?: () => void): Promise<PhiraBestSnapshot | null> {
    if (values.length === 0) {
      const previous = await this.loadBests(id);
      assertCurrent?.();
      return previous;
    }
    return this.repository.updateResource<PhiraBestSnapshot>(phiraBestCacheKey(id), PHIRA_BEST_SCHEMA_VERSION, (previous) => {
      const items = { ...(bestSchema.safeParse(previous).data?.items ?? {}) };
      for (const item of values) items[String(item.chart.id)] = item;
      const source = phiraSource();
      return { value: { items, source }, updatedAt: source.updatedAt };
    }, assertCurrent);
  }
  async clearPlayer(id: number) {
    await this.repository.clearResources([phiraPlayerCacheKey(id), phiraBestCacheKey(id)]);
  }
}

export const phiraCache = new PhiraCache();
