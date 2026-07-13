export interface ResourceRepository {
  getResource<T>(key: string, schemaVersion: number): Promise<T | null>;
  saveResource<T>(key: string, schemaVersion: number, updatedAt: string, value: T): Promise<void>;
  deleteResource(key: string): Promise<void>;
}
