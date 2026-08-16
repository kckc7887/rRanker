/**
 * 归一化数值输入文本：NFKC 全半角归一、去首尾空白、首个半角逗号转小数点。
 *
 * 用于各筛选/计算器输入框的统一预处理；只负责归一化，
 * 空串判定、区间校验等语义由调用方自行处理。
 */
export function normalizeNumericInput(value: string): string {
  return value.normalize('NFKC').trim().replace(',', '.');
}

/**
 * 解析数值输入文本为数字：先做 NFKC 归一化（见 {@link normalizeNumericInput}），
 * 归一化后为空串时返回 NaN，其余交给 Number() 解析（解析失败同样为 NaN）。
 */
export function parseNumericInput(value: string): number {
  const normalized = normalizeNumericInput(value);
  return normalized ? Number(normalized) : Number.NaN;
}
