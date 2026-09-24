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
  /**
   * 合并查询到的 bests 到账号快照。
   * 提交走仓储的原子读改写，并发的总览刷新与按谱面查询不会互相覆盖；
   * 同一谱面并发提交时按提交顺序后者获胜。
   * values 为空表示本次没有成功项：只读回既有快照（可能不存在），不写入、不推进 updatedAt。
   */
  async mergeBests(id: number, values: readonly PhiraQueriedBest[], assertCurrent?: () => void): Promise<PhiraBestSnapshot | null> {
    if (values.length === 0) {
      const previous = await this.loadBests(id);
      assertCurrent?.();
      return previous;
    }
    return this.repository.updateResource<PhiraBestSnapshot>(phiraBestCacheKey(id), PHIRA_BEST_SCHEMA_VERSION, (previous) => {
      const items = { ...(previous?.items ?? {}) };
      for (const item of values) items[String(item.chart.id)] = item;
      const source = phiraSource();
      return { value: { items, source }, updatedAt: source.updatedAt };
    }, assertCurrent);
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
