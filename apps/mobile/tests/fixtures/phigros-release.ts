import { createHash } from 'node:crypto';

export function releaseFixture(revision = 'r1', songIds = ['Song.A'], options: { music?: boolean; variants?: number[] } = {}) {
  const encode = (value: string) => new TextEncoder().encode(value);
  const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
  const files: Record<string, Uint8Array> = {
    'catalog.json': encode(JSON.stringify({ songCount: songIds.length, songs: songIds.map((id) => ({
      id, title: id, composer: 'Artist', illustrator: 'I', charters: ['e'], difficulties: [1],
    })) })),
    'metadata/note_counts.tsv': encode(songIds.map((id) => `${id}.0\t[1,2,3,4]`).join('\n')),
    'metadata/difficulty.tsv': encode(songIds.map((id) => `${id}\t1`).join('\n')),
  };
  for (const id of songIds) {
    files[`charts/${id}.0/EZ.json`] = encode('{"judgeLineList":[]}');
    if (options.music !== false) files[`music/${id}.ogg`] = encode('OggSfixture');
    files[`illustrations/${id}.png`] = encode('PNGfixture');
    for (const variant of options.variants ?? []) {
      files[`charts/${id}.${variant}/EZ.json`] = encode(`{"variant":${variant},"judgeLineList":[]}`);
      files[`music/${id}.${variant}.ogg`] = encode(`OggSvariant${variant}`);
    }
  }
  const manifest = { gameVersion: '9.9.9', generatedAt: revision, assets: Object.entries(files).map(([path, bytes]) => ({
    path, size: bytes.length, sha256: hash(bytes), contentType: path.endsWith('.ogg') ? 'audio/ogg' : 'application/json',
  })) };
  const manifestBytes = encode(JSON.stringify(manifest));
  const current = {
    schemaVersion: 1, gameVersion: '9.9.9', resourceVersion: revision, publishedAt: revision,
    catalog: 'phigros/releases/9.9.9/catalog.json', manifest: 'phigros/releases/9.9.9/manifest.json',
    noteCounts: 'phigros/releases/9.9.9/metadata/note_counts.tsv', manifestSha256: hash(manifestBytes),
  };
  return { files, manifest, current, respond(input: RequestInfo | URL): Response {
    const path = decodeURIComponent(new URL(String(input)).pathname);
    if (path.endsWith('/current.json')) return new Response(JSON.stringify(current));
    if (path.endsWith('/manifest.json')) return new Response(manifestBytes);
    const file = files[path.replace('/phigros/releases/9.9.9/', '')];
    return file ? new Response(new Uint8Array(file)) : new Response('', { status: 404 });
  } };
}
