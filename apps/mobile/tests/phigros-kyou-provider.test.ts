import {
  PHIGROS_KYOU_TAGS_RESOURCE_KEY,
  PHIGROS_KYOU_TAGS_SCHEMA_VERSION,
  type PhigrosKyouChartTagsSnapshot,
} from '@/domain/phigros-kyou';
import { PhigrosKyouProvider } from '@/providers/phigros-kyou-provider';
import type { ResourceRepository } from '@/repositories/resource-repository';
import { ResourceService } from '@/services/resource-service';

const manifest = {
  ok: true,
  source: 'https://kyou.net.cn',
  finished_unix: 1_786_237_127,
  last_update: '2026-08-04',
  songs_rows: 1,
  aliases_rows: 1,
  charts_rows: 1,
  tag_vote_rows: 3,
};
const songs = [{ song_id: 'song_1', name: 'Song', pack: 'Pack' }];
const aliases = [{ song_id: 'song_1', song_name: 'Song', alias: 'Alias' }];
const charts = [{
  chart_id: 'song_1_in', song_id: 'song_1', song_name: 'Song', difficulty: 'in', constant: 14.2,
  main_label: '读谱', main_label_question: true, main_top_votes: 8, main_second_votes: 2, tag_source: 'Kyou',
}];
const tags = [
  { tag_id: 152, tag: '读谱', tag_type: 'primary', parent_ids: '', description: '读谱相关难点' },
  { tag_id: 156, tag: '差速', tag_type: 'secondary', parent_ids: '152', description: '速度不同' },
  { tag_id: 157, tag: '脑裂', tag_type: 'secondary', parent_ids: '152', description: '多线配置' },
];
const votes = [
  { chart_id: 'song_1_in', song_id: 'song_1', song_name: 'Song', difficulty: 'in', tag_type: 'primary', tag_id: 152, tag: '读谱', votes: 8, parent_ids: '', source: 'Kyou' },
  { chart_id: 'song_1_in', song_id: 'song_1', song_name: 'Song', difficulty: 'in', tag_type: 'secondary', tag_id: 156, tag: '差速', votes: 3, parent_ids: '152', source: 'Kyou' },
  { chart_id: 'song_1_in', song_id: 'song_1', song_name: 'Song', difficulty: 'in', tag_type: 'secondary', tag_id: 157, tag: '脑裂', votes: 0, parent_ids: '152', source: 'Kyou' },
];

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}

function stubRoutes(overrides: Partial<Record<string, unknown>> = {}) {
  const payloads: Record<string, unknown> = {
    'manifest.json': manifest,
    'songs.json': songs,
    'aliases.json': aliases,
    'charts.json': charts,
    'tag_catalog.json': tags,
    'tag_votes.json': votes,
    ...overrides,
  };
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    const name = String(input).split('/').at(-1)!;
    const value = payloads[name];
    return value instanceof Response ? value : json(value);
  }));
}

describe('PhigrosKyouProvider', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('loads the validated JSON resources and keeps main_label_question informational', async () => {
    stubRoutes();
    const provider = new PhigrosKyouProvider();
    await expect(provider.getAliases()).resolves.toMatchObject({
      aliases: [{ songId: 'song_1', songName: 'Song', alias: 'Alias' }],
      source: { kind: 'kyou', label: 'Kyou Phigros 别名', isStale: false },
    });
    const snapshot = await provider.getChartTags();
    expect(snapshot.charts[0]).toMatchObject({ mainLabelQuestion: true, constant: 14.2 });
    expect(snapshot.tags.map((tag) => tag.id)).toEqual([152, 156]);
    expect(snapshot.votes).toHaveLength(3);
  });

  it('rejects manifest count mismatches and malformed JSON', async () => {
    stubRoutes({ 'manifest.json': { ...manifest, songs_rows: 2 } });
    await expect(new PhigrosKyouProvider().getAliases()).rejects.toMatchObject({ code: 'upstream_schema' });
    vi.unstubAllGlobals();
    stubRoutes({ 'aliases.json': new Response('{', { status: 200 }) });
    await expect(new PhigrosKyouProvider().getAliases()).rejects.toMatchObject({ code: 'upstream_schema' });
  });

  it('rejects unknown song, chart, tag, and parent references', async () => {
    stubRoutes({
      'tag_votes.json': [{ ...votes[0], chart_id: 'missing' }, votes[1], votes[2]],
    });
    await expect(new PhigrosKyouProvider().getChartTags()).rejects.toThrow('未知或不一致的谱面');
    vi.unstubAllGlobals();
    stubRoutes({
      'tag_catalog.json': [{ ...tags[0] }, { ...tags[1], parent_ids: '999' }, tags[2]],
    });
    await expect(new PhigrosKyouProvider().getChartTags()).rejects.toThrow('未知的主标签');
    vi.unstubAllGlobals();
    stubRoutes({
      'tag_votes.json': [votes[0], { ...votes[1], tag_id: 999 }, votes[2]],
    });
    await expect(new PhigrosKyouProvider().getChartTags()).rejects.toThrow('未知或不一致的标签');
    vi.unstubAllGlobals();
    stubRoutes({
      'charts.json': [{ ...charts[0], song_id: 'missing' }],
    });
    await expect(new PhigrosKyouProvider().getChartTags()).rejects.toThrow('未知或不一致的歌曲');
  });

  it('returns a stale SQLite resource when the Kyou network read fails', async () => {
    const cached: PhigrosKyouChartTagsSnapshot = {
      songs: [], charts: [], tags: [], votes: [],
      source: { kind: 'kyou', label: 'Kyou', updatedAt: '2026-08-09T00:00:00.000Z', isStale: false },
    };
    const repository: ResourceRepository = {
      getResource: async <T>() => cached as T,
      saveResource: async () => undefined,
      deleteResource: async () => undefined,
    };
    const result = await new ResourceService(repository).load<PhigrosKyouChartTagsSnapshot>(
      PHIGROS_KYOU_TAGS_RESOURCE_KEY,
      PHIGROS_KYOU_TAGS_SCHEMA_VERSION,
      async () => { throw new Error('offline'); },
    );
    expect(result.source).toMatchObject({ kind: 'cache', isStale: true, label: 'Kyou缓存' });
  });
});
