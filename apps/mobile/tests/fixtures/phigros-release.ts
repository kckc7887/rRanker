import { createHash } from 'node:crypto';

export function releaseFixture(
  revision = 'r1',
  songIds = ['Song.A'],
  options: { music?: boolean; variants?: number[]; variantMusic?: boolean; avatars?: Record<string, string>; noteCounts?: string } = {},
) {
  const encode = (value: string) => new TextEncoder().encode(value);
  const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
  const files: Record<string, Uint8Array> = {
    'catalog.json': encode(JSON.stringify({ songCount: songIds.length, songs: songIds.map((id) => ({
      id, title: id, composer: 'Artist', illustrator: 'I', charters: ['e'], difficulties: [1],
    })) })),
    'metadata/note_counts.tsv': encode(options.noteCounts ?? songIds.map((id) => `${id}.0\t[1,2,3,4]`).join('\n')),
    'metadata/difficulty.tsv': encode(songIds.map((id) => `${id}\t1`).join('\n')),
    'metadata/tmp.tsv': encode(Object.entries(options.avatars ?? { Glaciaxion: 'Glaciaxion' }).map(([name, file]) => `${name}\t${file}`).join('\n')),
  };
  for (const name of Object.values(options.avatars ?? { Glaciaxion: 'Glaciaxion' })) files[`avatars/${name}.png`] = encode(`avatar-${name}`);
  for (const id of songIds) {
    files[`charts/${id}.0/EZ.json`] = encode('{"judgeLineList":[]}');
    if (options.music !== false) files[`music/${id}.ogg`] = encode('OggSfixture');
    for (const category of ['illustrations', 'illustrations-blur', 'illustrations-lowres']) files[`${category}/${id}.png`] = encode(`PNGfixture-${id}-${category}`);
    for (const variant of options.variants ?? []) {
      files[`charts/${id}.${variant}/EZ.json`] = encode(`{"variant":${variant},"judgeLineList":[]}`);
      if (options.variantMusic !== false) files[`music/${id}.${variant}.ogg`] = encode(`OggSvariant${variant}`);
    }
  }
  const key = (path: string) => `phigros/${path.includes('/') ? path.split('/')[0] : 'metadata'}/${hash(files[path]!)}.${path.split('.').at(-1)}`;
  const objectKeys = Object.fromEntries(Object.keys(files).map(path => [path, key(path)]));
  const manifest = { schemaVersion: 2 as const, resourceVersion: revision, gameVersion: '9.9.9', generatedAt: revision, assets: Object.entries(files).map(([path, bytes]) => ({
    path, objectKey: objectKeys[path]!, size: bytes.length, sha256: hash(bytes), contentType: path.endsWith('.ogg') ? 'audio/ogg' : 'application/json',
  })) };
  const manifestBytes = encode(JSON.stringify(manifest));
  const current = {
    schemaVersion: 2 as const, gameVersion: '9.9.9', resourceVersion: revision, publishedAt: revision,
    catalog: objectKeys['catalog.json']!, manifest: `phigros/manifests/${hash(manifestBytes)}.json`,
    noteCounts: objectKeys['metadata/note_counts.tsv']!, manifestSha256: hash(manifestBytes),
  };
  return { files, manifest, current, objectKeys, respond(input: RequestInfo | URL): Response {
    const path = decodeURIComponent(new URL(String(input)).pathname);
    if (path.endsWith('/latest.json')) return new Response(JSON.stringify(current));
    if (path === `/${current.manifest}`) return new Response(manifestBytes);
    const logical = Object.keys(objectKeys).find(name => `/${objectKeys[name]}` === path);
    const file = logical ? files[logical] : undefined;
    return file ? new Response(new Uint8Array(file)) : new Response('', { status: 404 });
  } };
}
