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

export function rpeResourceUrl(basePath: string, reference: string): string | null {
  const relative = rpeBundleRelativePath(reference);
  if (!relative) return null;
  return basePath + relative.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}
