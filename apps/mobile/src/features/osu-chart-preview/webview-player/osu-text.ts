export type PreviewResource = Uint8Array | { uri: string };
export type PreviewResourceMap = ReadonlyMap<string, PreviewResource>;

function decodeUtf16(bytes: Uint8Array, littleEndian: boolean): string {
  const units: number[] = [];
  const chunks: string[] = [];
  const read = (offset: number): number => littleEndian
    ? bytes[offset]! | bytes[offset + 1]! << 8 : bytes[offset]! << 8 | bytes[offset + 1]!;
  let offset = 2;
  for (; offset + 1 < bytes.length; offset += 2) {
    const unit = read(offset);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = offset + 3 < bytes.length ? read(offset + 2) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) { units.push(unit, next); offset += 2; }
      else units.push(0xfffd);
    } else units.push(unit >= 0xdc00 && unit <= 0xdfff ? 0xfffd : unit);
    if (units.length >= 4096) { chunks.push(String.fromCharCode(...units)); units.length = 0; }
  }
  if (offset < bytes.length) units.push(0xfffd);
  chunks.push(String.fromCharCode(...units));
  return chunks.join('');
}

export function decodeOsuText(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return decodeUtf16(bytes, true);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return decodeUtf16(bytes, false);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

export function normalizeArchivePath(path: string): string {
  const raw = path.replace(/\\/g, '/');
  if (/^(?:[a-z][a-z\d+.-]*:|\/)/i.test(raw)) return '';
  const parts: string[] = [];
  for (const part of raw.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!parts.length) return '';
      parts.pop();
    } else parts.push(part);
  }
  return parts.join('/');
}

export function resolveArchivePath(name: string, sourcePath = ''): string {
  const raw = name.replace(/\\/g, '/');
  if (/^(?:[a-z][a-z\d+.-]*:|\/)/i.test(raw)) return '';
  const source = normalizeArchivePath(sourcePath);
  const dir = source.includes('/') ? source.slice(0, source.lastIndexOf('/') + 1) : '';
  return normalizeArchivePath(dir + raw);
}

export function archiveBasename(path: string): string {
  const normalized = normalizeArchivePath(path);
  const slash = normalized.lastIndexOf('/');
  return slash >= 0 ? normalized.slice(slash + 1) : normalized;
}

export function isOsuPath(path: string): boolean {
  return archiveBasename(path).toLowerCase().endsWith('.osu');
}

export function isOsbPath(path: string): boolean {
  return archiveBasename(path).toLowerCase().endsWith('.osb');
}

export function findArchiveResource(files: PreviewResourceMap, name: string, sourcePath = ''): { path: string; resource: PreviewResource } | undefined {
  const wanted = resolveArchivePath(name, sourcePath).toLowerCase();
  if (!wanted) return undefined;
  for (const [path, resource] of files) {
    if (normalizeArchivePath(path).toLowerCase() === wanted) return { path, resource };
  }
  // Even a unique basename elsewhere can belong to another map. The declaring
  // .osu/.osb path already includes any archive wrapper, so never guess a suffix.
  return undefined;
}

export function findArchiveEntry(files: PreviewResourceMap, name: string, sourcePath = ''): { path: string; bytes: Uint8Array } | undefined {
  const entry = findArchiveResource(files, name, sourcePath);
  return entry?.resource instanceof Uint8Array ? { path: entry.path, bytes: entry.resource } : undefined;
}

export function findArchiveBytes(files: PreviewResourceMap, name: string, sourcePath = ''): Uint8Array | undefined {
  return findArchiveEntry(files, name, sourcePath)?.bytes;
}

export function listOsbSources(files: PreviewResourceMap, osuPath: string): {path: string; text: string}[] {
  const dir = (path: string): string => normalizeArchivePath(path).split('/').slice(0, -1).join('/').toLowerCase();
  const sourceDir = dir(osuPath);
  return [...files.entries()]
    .filter((entry): entry is [string, Uint8Array] => entry[1] instanceof Uint8Array && isOsbPath(entry[0]) && dir(entry[0]) === sourceDir)
    .sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([path, bytes]) => ({ path, text: decodeOsuText(bytes) }));
}
