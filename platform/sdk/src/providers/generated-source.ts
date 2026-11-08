import type { DataSource } from '@rranker/sdk/data';

export function generatedSource(): DataSource {
  return {
    kind: 'generated',
    label: '示例账号',
    updatedAt: new Date().toISOString(),
    isStale: false,
  };
}
