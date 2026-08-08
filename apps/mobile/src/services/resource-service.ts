import type { DataSource } from '@/domain/models';
import type { ResourceRepository } from '@/repositories/resource-repository';

interface Sourced { source: DataSource }

/** 缓存优先渲染时的来源标记：label 原样保留，仅标记为缓存且过期（后台刷新中）。 */
export function staleCachedResource<T extends Sourced>(value: T): T {
  if (value.source.kind === 'cache') return value;
  return {
    ...value,
    source: { ...value.source, kind: 'cache', isStale: true },
  };
}

export class ResourceService {
  constructor(private readonly repository?: ResourceRepository) {}

  /** 只读本地缓存，不触发网络；无缓存返回 null。 */
  async getCached<T extends Sourced>(key: string, schemaVersion: number): Promise<T | null> {
    return this.repository?.getResource<T>(key, schemaVersion) ?? null;
  }

  async load<T extends Sourced>(key: string, schemaVersion: number, read: () => Promise<T>): Promise<T> {
    try {
      const value = await read();
      await this.repository?.saveResource(key, schemaVersion, value.source.updatedAt, value);
      return value;
    } catch (error) {
      const cached = await this.repository?.getResource<T>(key, schemaVersion);
      if (!cached) throw error;
      return {
        ...cached,
        source: {
          ...cached.source, kind: 'cache', isStale: true,
          label: `${cached.source.label}缓存`,
        },
      };
    }
  }
}
