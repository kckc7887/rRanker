import type { GamePayload } from '@/domain/game-data';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

export type PhigrosGameDataPayload = Extract<GamePayload, { kind: 'phigros' }>;

const PHIGROS_SAVE_SCHEMA_VERSION = 1;

function phigrosSaveResourceKey(accountId: string): string {
  return `phigros-save:${accountId}`;
}

/** 缓存优先渲染时的来源标记：label 原样保留，仅标记为缓存且过期（后台刷新中）。 */
export function stalePhigrosPayload(payload: PhigrosGameDataPayload): PhigrosGameDataPayload {
  return {
    ...payload,
    source: { ...payload.source, kind: 'cache', isStale: true },
    catalogSource: { ...payload.catalogSource, kind: 'cache', isStale: true },
  };
}

/**
 * Phigros 云端存档的本地持久化快照。
 * 每次同步都需重新下载云存档 zip 并解析（TapTap 存档 + 定数表），
 * 首屏先渲染上次成功同步的 payload，后台刷新完成后静默替换。
 */
export class PhigrosSaveCache {
  constructor(private readonly repository = new SqliteSnapshotRepository()) {}

  async load(accountId: string): Promise<PhigrosGameDataPayload | null> {
    return this.repository.getResource<PhigrosGameDataPayload>(
      phigrosSaveResourceKey(accountId),
      PHIGROS_SAVE_SCHEMA_VERSION,
    );
  }

  async save(accountId: string, payload: PhigrosGameDataPayload): Promise<void> {
    await this.repository.saveResource(
      phigrosSaveResourceKey(accountId),
      PHIGROS_SAVE_SCHEMA_VERSION,
      payload.saveUpdatedAt,
      payload,
    );
  }
}
