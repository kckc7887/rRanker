import type { DataSource } from '@/domain/models';

/**
 * 全曲全谱面满成绩示例查分器的统一数据来源标记。
 * maimai 调用方提供完整名称。
 */
export function generatedSource(label = '示例查分器（全曲全谱面满成绩）'): DataSource {
  return {
    kind: 'generated',
    label,
    updatedAt: new Date().toISOString(),
    isStale: false,
  };
}
