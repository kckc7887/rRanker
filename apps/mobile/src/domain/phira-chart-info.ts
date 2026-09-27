/** info.yml 的简单标量键读取；不执行网络或 ZIP I/O。 */
export function infoValue(text: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`^\\s*${escaped}\\s*:\\s*(.+?)\\s*$`, 'mi'));
  return match?.[1]?.replace(/^['"]|['"]$/g, '') ?? null;
}
