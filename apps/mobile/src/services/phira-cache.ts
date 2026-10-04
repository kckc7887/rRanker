import type {
  PhiraBestSnapshot, PhiraChartPage, PhiraChartSnapshot, PhiraChartStatus, PhiraNoteSnapshot,
  PhiraPlayerSnapshot, PhiraQueriedBest,
} from '@/domain/phira';
import {
  PhiraUserSchema, PhiraUserStatsSchema, PhiraPoolSchema, PhiraRecordSchema, PhiraChartSchema, PhiraChartPageSchema,
  PHIRA_BEST_SCHEMA_VERSION, PHIRA_CHART_SCHEMA_VERSION, PHIRA_NOTE_SCHEMA_VERSION,
  PHIRA_PAGE_SCHEMA_VERSION, PHIRA_PLAYER_SCHEMA_VERSION, phiraBestCacheKey, phiraChartCacheKey,
  phiraNoteCacheKey, phiraPageCacheKey, phiraPlayerCacheKey,
} from '@/domain/phira';
import type { DataSource } from '@/domain/models';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import type { AtomicResourceRepository, ResourceMaintenanceRepository } from '@/repositories/resource-repository';
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
const chartSchema = z.object({ chart: PhiraChartSchema, source: sourceSchema });
const noteCount = z.number().int().nonnegative();
const noteSchema = z.object({
  chartUpdated: z.string().nullable(),
  counts: z.object({ click: noteCount, hold: noteCount, flick: noteCount, drag: noteCount }).nullable(),
  unavailableReason: z.string().optional(), source: sourceSchema,
});
const pageSchema = z.object({ data: PhiraChartPageSchema, source: sourceSchema });
function validated<T>(value: unknown, schema: z.ZodType<T>): T | null {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function phiraSource(updatedAt = new Date().toISOString()): DataSource {
  return snapshotSource({ kind: 'phira', label: 'Phira 社区公开数据' }, updatedAt);
}

export class PhiraCache {
  constructor(private readonly repository: Pick<AtomicResourceRepository, 'getResource' | 'saveResource' | 'updateResource'> & Pick<ResourceMaintenanceRepository, 'clearResources'> = new SqliteSnapshotRepository()) {}
  async loadPlayer(id: number): Promise<PhiraPlayerSnapshot | null> {
    const value = validated(await this.repository.getResource(phiraPlayerCacheKey(id), PHIRA_PLAYER_SCHEMA_VERSION), playerSchema);
    return value?.player.id === id ? value : null;
  }
  savePlayer(id: number, value: PhiraPlayerSnapshot, assertCurrent?: () => void) { return this.repository.saveResource(phiraPlayerCacheKey(id), PHIRA_PLAYER_SCHEMA_VERSION, value.source.updatedAt, value, assertCurrent); }
  async loadBests(id: number): Promise<PhiraBestSnapshot | null> { return validated(await this.repository.getResource(phiraBestCacheKey(id), PHIRA_BEST_SCHEMA_VERSION), bestSchema); }
  saveBests(id: number, value: PhiraBestSnapshot, assertCurrent?: () => void) { return this.repository.saveResource(phiraBestCacheKey(id), PHIRA_BEST_SCHEMA_VERSION, value.source.updatedAt, value, assertCurrent); }
  async mergeBests(id: number, values: readonly PhiraQueriedBest[], assertCurrent?: () => void): Promise<PhiraBestSnapshot | null> {
    if (values.length === 0) {
      const previous = await this.loadBests(id);
      assertCurrent?.();
      return previous;
    }
    return this.repository.updateResource<PhiraBestSnapshot>(phiraBestCacheKey(id), PHIRA_BEST_SCHEMA_VERSION, (previous) => {
      const items = { ...(validated(previous, bestSchema)?.items ?? {}) };
      for (const item of values) items[String(item.chart.id)] = item;
      const source = phiraSource();
      return { value: { items, source }, updatedAt: source.updatedAt };
    }, assertCurrent);
  }
  async loadChart(id: number): Promise<PhiraChartSnapshot | null> {
    const value = validated(await this.repository.getResource(phiraChartCacheKey(id), PHIRA_CHART_SCHEMA_VERSION), chartSchema);
    return value?.chart.id === id ? value : null;
  }
  saveChart(id: number, value: PhiraChartSnapshot, assertCurrent?: () => void) { return this.repository.saveResource(phiraChartCacheKey(id), PHIRA_CHART_SCHEMA_VERSION, value.source.updatedAt, value, assertCurrent); }
  async loadNotes(id: number): Promise<PhiraNoteSnapshot | null> { return validated(await this.repository.getResource(phiraNoteCacheKey(id), PHIRA_NOTE_SCHEMA_VERSION), noteSchema); }
  saveNotes(id: number, value: PhiraNoteSnapshot, assertCurrent?: () => void) { return this.repository.saveResource(phiraNoteCacheKey(id), PHIRA_NOTE_SCHEMA_VERSION, value.source.updatedAt, value, assertCurrent); }
  async loadPage(status: PhiraChartStatus, page: number, search = '') {
    return validated(await this.repository.getResource(phiraPageCacheKey(status, page, search), PHIRA_PAGE_SCHEMA_VERSION), pageSchema);
  }
  savePage(status: PhiraChartStatus, page: number, search: string, value: { data: PhiraChartPage; source: DataSource }, assertCurrent?: () => void) {
    return this.repository.saveResource(phiraPageCacheKey(status, page, search), PHIRA_PAGE_SCHEMA_VERSION, value.source.updatedAt, value, assertCurrent);
  }
  async clearPlayer(id: number) {
    await this.repository.clearResources([phiraPlayerCacheKey(id), phiraBestCacheKey(id)]);
  }
}

export const phiraCache = new PhiraCache();
