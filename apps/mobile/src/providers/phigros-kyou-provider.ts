import { z } from 'zod';
import { PHIGROS_OSS_BASE } from '@/domain/account-avatar';
import type {
  PhigrosKyouAliasesSnapshot,
  PhigrosKyouChartTagsSnapshot,
  PhigrosKyouTagType,
} from '@/domain/phigros-kyou';
import { ProviderError } from '@/providers/errors';

const BASE = `${PHIGROS_OSS_BASE}/kyou/latest`;

const ManifestSchema = z.object({
  ok: z.literal(true),
  source: z.string().min(1),
  finished_unix: z.number().finite().positive(),
  last_update: z.string().min(1),
  songs_rows: z.number().int().nonnegative(),
  aliases_rows: z.number().int().nonnegative(),
  charts_rows: z.number().int().nonnegative(),
  tag_vote_rows: z.number().int().nonnegative(),
}).passthrough();

const SongSchema = z.object({
  song_id: z.string().min(1),
  name: z.string().min(1),
  pack: z.string(),
});
const AliasSchema = z.object({
  song_id: z.string().min(1),
  song_name: z.string().min(1),
  alias: z.string().min(1),
});
const DifficultySchema = z.enum(['ez', 'hd', 'in', 'at']);
const TagTypeSchema = z.enum(['primary', 'secondary']);
const ChartSchema = z.object({
  chart_id: z.string().min(1),
  song_id: z.string().min(1),
  song_name: z.string().min(1),
  difficulty: DifficultySchema,
  constant: z.number().finite().nonnegative(),
  main_label: z.string(),
  main_label_question: z.boolean(),
  main_top_votes: z.number().int().nonnegative(),
  main_second_votes: z.number().int().nonnegative(),
  tag_source: z.string().min(1),
});
const TagSchema = z.object({
  tag_id: z.number().int().nonnegative(),
  tag: z.string().min(1),
  tag_type: TagTypeSchema,
  parent_ids: z.string(),
  description: z.string(),
});
const TagVoteSchema = z.object({
  chart_id: z.string().min(1),
  song_id: z.string().min(1),
  song_name: z.string().min(1),
  difficulty: DifficultySchema,
  tag_type: TagTypeSchema,
  tag_id: z.number().int().nonnegative(),
  tag: z.string().min(1),
  votes: z.number().int().nonnegative(),
  parent_ids: z.string(),
  source: z.string().min(1),
});

function parseParentIds(value: string): number[] {
  if (!value.trim()) return [];
  const ids = value.split('|').map((item) => Number(item));
  if (ids.some((id) => !Number.isSafeInteger(id) || id < 0)) {
    throw new ProviderError('upstream_schema', 'Kyou 标签父级 ID 无效', true);
  }
  return [...new Set(ids)];
}

function assertUnique<T>(values: readonly T[], key: (value: T) => string | number, label: string): void {
  const seen = new Set<string | number>();
  for (const value of values) {
    const id = key(value);
    if (seen.has(id)) throw new ProviderError('upstream_schema', `Kyou ${label}存在重复 ID`, true);
    seen.add(id);
  }
}

function assertCount(actual: number, expected: number, label: string): void {
  if (actual !== expected) {
    throw new ProviderError('upstream_schema', `Kyou ${label}数量与 manifest 不一致`, true);
  }
}

export class PhigrosKyouProvider {
  private async fetchJson<T>(name: string, schema: z.ZodType<T>): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(`${BASE}/${name}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) throw new ProviderError('network', `Kyou 请求失败 HTTP ${response.status}`, true);
      return schema.parse(await response.json());
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (error instanceof z.ZodError || error instanceof SyntaxError) {
        throw new ProviderError('upstream_schema', 'Kyou 数据结构与已验证契约不一致', true, { cause: error });
      }
      if ((controller.signal.aborted || (error instanceof Error && error.name === 'AbortError'))) {
        throw new ProviderError('timeout', 'Kyou 数据读取超时', true, { cause: error });
      }
      throw new ProviderError('network', '无法连接 Kyou 数据服务', true, { cause: error });
    } finally {
      clearTimeout(timeout);
    }
  }

  private source(finishedUnix: number, label: string) {
    return {
      kind: 'kyou' as const,
      label,
      updatedAt: new Date(finishedUnix * 1000).toISOString(),
      isStale: false,
    };
  }

  async getAliases(): Promise<PhigrosKyouAliasesSnapshot> {
    const [manifest, songs, aliases] = await Promise.all([
      this.fetchJson('manifest.json', ManifestSchema),
      this.fetchJson('songs.json', z.array(SongSchema)),
      this.fetchJson('aliases.json', z.array(AliasSchema)),
    ]);
    assertCount(songs.length, manifest.songs_rows, '歌曲');
    assertCount(aliases.length, manifest.aliases_rows, '别名');
    assertUnique(songs, (song) => song.song_id, '歌曲');
    const songsById = new Map(songs.map((song) => [song.song_id, song]));
    for (const alias of aliases) {
      const song = songsById.get(alias.song_id);
      if (!song || song.name !== alias.song_name) {
        throw new ProviderError('upstream_schema', 'Kyou 别名引用了未知或不一致的歌曲', true);
      }
    }
    return {
      songs: songs.map((song) => ({ songId: song.song_id, name: song.name, pack: song.pack })),
      aliases: aliases.map((alias) => ({
        songId: alias.song_id,
        songName: alias.song_name,
        alias: alias.alias,
      })),
      source: this.source(manifest.finished_unix, 'Kyou Phigros 别名'),
    };
  }

  async getChartTags(): Promise<PhigrosKyouChartTagsSnapshot> {
    const [manifest, songs, charts, tags, votes] = await Promise.all([
      this.fetchJson('manifest.json', ManifestSchema),
      this.fetchJson('songs.json', z.array(SongSchema)),
      this.fetchJson('charts.json', z.array(ChartSchema)),
      this.fetchJson('tag_catalog.json', z.array(TagSchema)),
      this.fetchJson('tag_votes.json', z.array(TagVoteSchema)),
    ]);
    assertCount(songs.length, manifest.songs_rows, '歌曲');
    assertCount(charts.length, manifest.charts_rows, '谱面');
    assertCount(votes.length, manifest.tag_vote_rows, '标签投票');
    assertUnique(songs, (song) => song.song_id, '歌曲');
    assertUnique(charts, (chart) => chart.chart_id, '谱面');
    assertUnique(charts, (chart) => `${chart.song_id}:${chart.difficulty}`, '歌曲难度谱面');
    assertUnique(tags, (tag) => tag.tag_id, '标签');

    const songsById = new Map(songs.map((song) => [song.song_id, song]));
    const chartsById = new Map(charts.map((chart) => [chart.chart_id, chart]));
    const tagsById = new Map(tags.map((tag) => [tag.tag_id, tag]));
    for (const chart of charts) {
      const song = songsById.get(chart.song_id);
      if (!song || song.name !== chart.song_name) {
        throw new ProviderError('upstream_schema', 'Kyou 谱面引用了未知或不一致的歌曲', true);
      }
    }
    for (const tag of tags) {
      for (const parentId of parseParentIds(tag.parent_ids)) {
        const parent = tagsById.get(parentId);
        if (!parent || parent.tag_type !== 'primary') {
          throw new ProviderError('upstream_schema', 'Kyou 标签引用了未知的主标签', true);
        }
      }
    }
    for (const vote of votes) {
      const chart = chartsById.get(vote.chart_id);
      const tag = tagsById.get(vote.tag_id);
      if (!chart || chart.song_id !== vote.song_id || chart.song_name !== vote.song_name
        || chart.difficulty !== vote.difficulty) {
        throw new ProviderError('upstream_schema', 'Kyou 投票引用了未知或不一致的谱面', true);
      }
      if (!tag || tag.tag !== vote.tag || tag.tag_type !== vote.tag_type) {
        throw new ProviderError('upstream_schema', 'Kyou 投票引用了未知或不一致的标签', true);
      }
      const voteParents = parseParentIds(vote.parent_ids);
      const tagParents = parseParentIds(tag.parent_ids);
      if (voteParents.length !== tagParents.length
        || voteParents.some((parentId) => !tagParents.includes(parentId))) {
        throw new ProviderError('upstream_schema', 'Kyou 投票的标签父级关系不一致', true);
      }
    }
    const positiveTagIds = new Set(votes.filter((vote) => vote.votes > 0).map((vote) => vote.tag_id));

    return {
      songs: songs.map((song) => ({ songId: song.song_id, name: song.name, pack: song.pack })),
      charts: charts.map((chart) => ({
        chartId: chart.chart_id,
        songId: chart.song_id,
        songName: chart.song_name,
        difficulty: chart.difficulty,
        constant: chart.constant,
        mainLabel: chart.main_label,
        mainLabelQuestion: chart.main_label_question,
        mainTopVotes: chart.main_top_votes,
        mainSecondVotes: chart.main_second_votes,
        tagSource: chart.tag_source,
      })),
      tags: tags.filter((tag) => positiveTagIds.has(tag.tag_id)).map((tag) => ({
        id: tag.tag_id,
        name: tag.tag,
        type: tag.tag_type as PhigrosKyouTagType,
        parentIds: parseParentIds(tag.parent_ids),
        description: tag.description,
      })),
      votes: votes.map((vote) => ({
        chartId: vote.chart_id,
        songId: vote.song_id,
        songName: vote.song_name,
        difficulty: vote.difficulty,
        tagType: vote.tag_type as PhigrosKyouTagType,
        tagId: vote.tag_id,
        tag: vote.tag,
        votes: vote.votes,
        parentIds: parseParentIds(vote.parent_ids),
        source: vote.source,
      })),
      source: this.source(manifest.finished_unix, 'Kyou Phigros 谱面标签'),
    };
  }
}
