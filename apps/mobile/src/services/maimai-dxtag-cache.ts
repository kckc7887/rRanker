import type { MaimaiDxTagChart } from '@/domain/maimai-dxtag';
import { z } from 'zod';
import {
  loadMaimaiDxTag,
  maimaiDxTagChartsSchema,
} from '@/providers/maimai-dxtag';
import { captureResourceWrites } from '@/services/snapshot-cache-utils';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

export const MAIMAI_DXTAG_SCHEMA_VERSION = 1;
export const MAIMAI_DXTAG_RESOURCE_PREFIX = 'maimai:dxtag:';

const repository = new SqliteSnapshotRepository();
const cachedSchema = z.object({ charts: maimaiDxTagChartsSchema });

export function maimaiDxTagResourceKey(chartId: number): string {
  return `${MAIMAI_DXTAG_RESOURCE_PREFIX}${chartId}`;
}

export async function loadCachedMaimaiDxTag(
  chartId: number,
  signal?: AbortSignal,
): Promise<readonly MaimaiDxTagChart[] | null> {
  const assertCurrent = captureResourceWrites('maimai', signal);
  const key = maimaiDxTagResourceKey(chartId);
  const cached = await repository.getResource(key, MAIMAI_DXTAG_SCHEMA_VERSION, cachedSchema);
  assertCurrent();
  if (cached) return cached.charts;
  const fresh = await loadMaimaiDxTag(chartId, signal);
  assertCurrent();
  if (!fresh) return null;
  await repository.saveResource(key, MAIMAI_DXTAG_SCHEMA_VERSION, new Date().toISOString(), { charts: fresh }, assertCurrent);
  return fresh;
}
