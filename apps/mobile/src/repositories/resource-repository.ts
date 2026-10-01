export interface ResourceRepository {
  getResource<T>(key: string, schemaVersion: number): Promise<T | null>;
  saveResource<T>(key: string, schemaVersion: number, updatedAt: string, value: T, assertCurrent?: () => void): Promise<void>;
  deleteResource(key: string): Promise<void>;
}

export interface AtomicResourceRepository extends ResourceRepository {
  updateResource<T>(key: string, schemaVersion: number,
    transform: (previous: T | null) => { value: T; updatedAt: string; write?: true } | { value: T; write: false },
    assertCurrent?: () => void): Promise<T>;
}

export interface ResourceMaintenanceRepository {
  listResourceSizes(): Promise<{ key: string; bytes: number }[]>;
  clearResources(keys: readonly string[]): Promise<void>;
}
