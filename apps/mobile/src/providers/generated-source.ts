import type { DataSource } from '@/domain/models';

export function generatedSource(label = '示例查分器（全曲全谱面满成绩）'): DataSource {
  return {
    kind: 'generated',
    label,
    updatedAt: new Date().toISOString(),
    isStale: false,
  };
}
