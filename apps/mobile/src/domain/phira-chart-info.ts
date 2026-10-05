export function infoValue(text: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`^\\s*${escaped}\\s*:\\s*(.+?)\\s*$`, 'mi'));
  return match?.[1]?.replace(/^['"]|['"]$/g, '') ?? null;
}
