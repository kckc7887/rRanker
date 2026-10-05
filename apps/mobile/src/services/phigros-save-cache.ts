import type { PhigrosGameDataPayload } from '@/domain/game-data';
import { staleCached } from '@/services/cache-first';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import type { ResourceRepository } from '@/repositories/resource-repository';
import { z } from 'zod';
import { DataSourceSchema, PlayerSchema, ScoreRecordSchema } from '@/domain/schemas';

export type { PhigrosGameDataPayload } from '@/domain/game-data';

const PHIGROS_SAVE_SCHEMA_VERSION = 1;
const progressCounts = z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative(), z.number().int().nonnegative(), z.number().int().nonnegative()]);
const payloadSchema: z.ZodType<PhigrosGameDataPayload> = z.object({
  kind: z.literal('phigros'), resourceRevision: z.string().optional(), player: PlayerSchema,
  records: z.array(ScoreRecordSchema),
  bestSections: z.array(z.object({ id: z.string(), title: z.string(), records: z.array(ScoreRecordSchema) })),
  playerScore: z.object({ label: z.string(), value: z.number().finite(), display: z.string() }),
  challengeModeRank: z.number().finite(), source: DataSourceSchema, saveUpdatedAt: z.string(), catalogSource: DataSourceSchema,
  avatarUrl: z.string().nullable().optional(), avatarKey: z.string().nullable().optional(), backgroundSongId: z.string().nullable().optional(),
  dataAmount: z.string(), progress: z.object({ cleared: progressCounts, fullCombo: progressCounts, phi: progressCounts }),
}).passthrough();

function phigrosSaveResourceKey(accountId: string): string {
  return `phigros-save:${accountId}`;
}

/** 缓存优先渲染时的来源标记：source 与 catalogSource 均打标，label 原样保留。 */
export function stalePhigrosPayload(payload: PhigrosGameDataPayload): PhigrosGameDataPayload {
  return {
    ...payload,
    source: staleCached(payload.source),
    catalogSource: staleCached(payload.catalogSource),
  };
}

/**
 * Phigros 云端存档的本地持久化快照。
 * 每次同步都需重新下载云存档 zip 并解析（TapTap 存档 + 定数表），
 * 首次查询可读取兼容快照；显式同步由数据服务重新加载。
 */
export class PhigrosSaveCache {
  constructor(private readonly repository: Pick<ResourceRepository, 'getResource' | 'saveResource'> = new SqliteSnapshotRepository()) {}

  async load(accountId: string): Promise<PhigrosGameDataPayload | null> {
    const stored = await this.repository.getResource<unknown>(
      phigrosSaveResourceKey(accountId),
      PHIGROS_SAVE_SCHEMA_VERSION,
    );
    return payloadSchema.safeParse(stored).data ?? null;
  }

  async save(accountId: string, payload: PhigrosGameDataPayload, assertCurrent?: () => void): Promise<void> {
    await this.repository.saveResource(
      phigrosSaveResourceKey(accountId),
      PHIGROS_SAVE_SCHEMA_VERSION,
      payload.saveUpdatedAt,
      payload, assertCurrent,
    );
  }
}
