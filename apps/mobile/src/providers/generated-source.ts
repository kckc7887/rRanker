import type { DataSource } from '@/domain/models';

/**
 * 全曲全谱面满成绩示例查分器的统一数据来源标记。
 * maimai 沿用历史文案「示例查分器（全谱面满成绩）」，调用处传参保持原值不变。
 */
export function generatedSource(label = '示例查分器（全曲全谱面满成绩）'): DataSource {
  return {
    kind: 'generated',
    label,
    updatedAt: new Date().toISOString(),
    isStale: false,
  };
}
