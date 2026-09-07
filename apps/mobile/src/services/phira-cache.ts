import type {
  PhiraBestSnapshot, PhiraChartPage, PhiraChartSnapshot, PhiraChartStatus, PhiraNoteSnapshot,
  PhiraPlayerSnapshot, PhiraQueriedBest,
} from '@/domain/phira';
import {
  PHIRA_BEST_SCHEMA_VERSION, PHIRA_CHART_SCHEMA_VERSION, PHIRA_NOTE_SCHEMA_VERSION,
  PHIRA_PAGE_SCHEMA_VERSION, PHIRA_PLAYER_SCHEMA_VERSION, phiraBestCacheKey, phiraChartCacheKey,
  phiraNoteCacheKey, phiraPageCacheKey, phiraPlayerCacheKey,
} from '@/domain/phira';
import type { DataSource } from '@/domain/models';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { snapshotSource } from '@/services/snapshot-cache-utils';

export function phiraSource(updatedAt = new Date().toISOString()): DataSource {
  return snapshotSource({ kind: 'phira', label: 'Phira 社区公开数据' }, updatedAt);
}

export class PhiraCache {
  constructor(private readonly repository = new SqliteSnapshotRepository()) {}
  loadPlayer(id: number) { return this.repository.getResource<PhiraPlayerSnapshot>(phiraPlayerCacheKey(id), PHIRA_PLAYER_SCHEMA_VERSION); }
  savePlayer(id: number, value: PhiraPlayerSnapshot, assertCurrent?: () => void) { return this.repository.saveResource(phiraPlayerCacheKey(id), PHIRA_PLAYER_SCHEMA_VERSION, value.source.updatedAt, value, assertCurrent); }
  loadBests(id: number) { return this.repository.getResource<PhiraBestSnapshot>(phiraBestCacheKey(id), PHIRA_BEST_SCHEMA_VERSION); }
  saveBests(id: number, value: PhiraBestSnapshot, assertCurrent?: () => void) { return this.repository.saveResource(phiraBestCacheKey(id), PHIRA_BEST_SCHEMA_VERSION, value.source.updatedAt, value, assertCurrent); }
  async mergeBests(id: number, values: readonly PhiraQueriedBest[], assertCurrent?: () => void): Promise<PhiraBestSnapshot> {
    const previous = await this.loadBests(id);
    const items = { ...(previous?.items ?? {}) };
    for (const item of values) items[String(item.chart.id)] = item;
    const value = { items, source: phiraSource() };
    await this.saveBests(id, value, assertCurrent);
    return value;
  }
  loadChart(id: number) { return this.repository.getResource<PhiraChartSnapshot>(phiraChartCacheKey(id), PHIRA_CHART_SCHEMA_VERSION); }
  saveChart(id: number, value: PhiraChartSnapshot, assertCurrent?: () => void) { return this.repository.saveResource(phiraChartCacheKey(id), PHIRA_CHART_SCHEMA_VERSION, value.source.updatedAt, value, assertCurrent); }
  loadNotes(id: number) { return this.repository.getResource<PhiraNoteSnapshot>(phiraNoteCacheKey(id), PHIRA_NOTE_SCHEMA_VERSION); }
  saveNotes(id: number, value: PhiraNoteSnapshot, assertCurrent?: () => void) { return this.repository.saveResource(phiraNoteCacheKey(id), PHIRA_NOTE_SCHEMA_VERSION, value.source.updatedAt, value, assertCurrent); }
  loadPage(status: PhiraChartStatus, page: number, search = '') {
    return this.repository.getResource<{ data: PhiraChartPage; source: DataSource }>(phiraPageCacheKey(status, page, search), PHIRA_PAGE_SCHEMA_VERSION);
  }
  savePage(status: PhiraChartStatus, page: number, search: string, value: { data: PhiraChartPage; source: DataSource }, assertCurrent?: () => void) {
    return this.repository.saveResource(phiraPageCacheKey(status, page, search), PHIRA_PAGE_SCHEMA_VERSION, value.source.updatedAt, value, assertCurrent);
  }
  async clearPlayer(id: number) {
    await this.repository.clearResources([phiraPlayerCacheKey(id), phiraBestCacheKey(id)]);
  }
}

export const phiraCache = new PhiraCache();
