import type { DataSource } from '@/domain/models';
import type { ResourceRepository } from '@/repositories/resource-repository';

interface Sourced { source: DataSource }

export class ResourceService {
  constructor(private readonly repository?: ResourceRepository) {}

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
