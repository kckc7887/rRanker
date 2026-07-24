/** 从解码结果中提取玩家二维码字符串（SGWCMAID…）。 */
export function extractMaimaiQrPayload(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const match = text.match(/SGWCMAID[0-9A-Za-z+/=_-]+/);
  if (match?.[0]) return match[0];
  // 部分环境可能直接给出完整码串
  if (/^SGWCMAID/i.test(text)) return text.replace(/\s+/g, '');
  return null;
}
