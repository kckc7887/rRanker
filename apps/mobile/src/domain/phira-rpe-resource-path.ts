/**
 * RPE 谱面包资源身份：保留合法相对路径（含中文、空格和嵌套目录）。
 * `..`、盘符和无内容路径拒绝，不压成 basename。
 */

export function rpeBundleRelativePath(entryName: string): string | null {
  if (typeof entryName !== 'string') return null;
  const normalized = entryName.replaceAll('\\', '/').trim();
  if (normalized.length === 0 || normalized.startsWith('//') || /^[A-Za-z]:/.test(normalized)) return null;
  const segments: string[] = [];
  for (const segment of normalized.split('/')) {
    if (segment.length === 0 || segment === '.') continue;
    if (segment === '..' || segment.includes('\0')) return null;
    segments.push(segment);
  }
  return segments.length > 0 ? segments.join('/') : null;
}

/** 用资源相对路径拼播放器 URL，路径段单独编码，斜杠保留。 */
export function rpeResourceUrl(basePath: string, reference: string): string | null {
  const relative = rpeBundleRelativePath(reference);
  if (!relative) return null;
  return basePath + relative.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}
