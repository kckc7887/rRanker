import { z } from 'zod';
import { MajdataSongSchema } from '@/domain/majdata';
import { DataSourceSchema } from '@/domain/schemas';
import type { MajdataSnapshot, MajdataSong } from '@/domain/majdata';
import type { DataSource } from '@/domain/models';
import type { HttpCookieSession } from '@/providers/http-cookies';
import { MajdataProvider, majdataProvider } from '@/providers/majdata-provider';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { applyMajdataSessionRotation, useSession } from '@/state/session-store';
import { snapshotSource, captureResourceWrites, createInflightGuard, resourceWriteGeneration, subscribeResourceWrites } from './snapshot-cache-utils';
import { getForegroundAbortSignal } from '@/state/app-lifecycle-core';
import { createBoundedLoadQueue } from './offset-pagination';
import { parseSimaiChart } from '@/features/simai-chart-preview/engine/core/parser/SimaiParser';
import { simaiStatistics } from '@/features/simai-chart-preview/statistics';
import { cacheFirstLoad } from './cache-first';
import {
  assertFreshSnapshotSource,
  cachedSnapshotSource,
  snapshotMetadataOf,
  type SnapshotMetadata,
} from '@/domain/refresh-result';

const resourceLoads = createInflightGuard<string>();
const songLoads = createBoundedLoadQueue(4);
const requestKey = (key: string) => `${resourceWriteGeneration('majdata-net')}:${key}`;
const repository = new SqliteSnapshotRepository();
const songRequests = new Map<string, number>();
const accountRequests = new Map<string, number>();
export const majdataSource = () => snapshotSource({ kind: 'majdata-net', label: 'Majdata Net' });
export const majdataAccountKey = (id: string) => `majdata-net:account:${id}`;
export const majdataSongKey = (id: string) => `majdata-net:song:${id}`;

/** 缓存首屏不占用网络槽位；所有实际歌曲请求共用四路上限。 */
async function requestMajdataSong(id: string, signal: AbortSignal, foregroundSignal: AbortSignal, assertCurrent: () => void): Promise<MajdataSong> {
  return songLoads(async () => {
    assertCurrent();
    const controller = new AbortController();
    const cancel = () => controller.abort(signal.aborted ? signal.reason : foregroundSignal.reason);
    signal.addEventListener('abort', cancel, { once: true });
    foregroundSignal.addEventListener('abort', cancel, { once: true });
    const unsubscribe = subscribeResourceWrites('majdata-net', () => controller.abort(new Error('缓存请求已失效')));
    try {
      if (signal.aborted || foregroundSignal.aborted) cancel();
      if (controller.signal.aborted) throw controller.signal.reason;
      const song = await majdataProvider.getSong(id, controller.signal);
      assertCurrent();
      if (controller.signal.aborted) throw controller.signal.reason;
      return song;
    } finally {
      signal.removeEventListener('abort', cancel);
      foregroundSignal.removeEventListener('abort', cancel);
      unsubscribe();
    }
  });
}

const songSnapshotSchema = z.object({
  song: MajdataSongSchema,
  source: DataSourceSchema.extend({ kind: z.literal('majdata-net') }),
});
type MajdataSongSnapshot = z.infer<typeof songSnapshotSchema>;

export function loadMajdataCached(id: string) { return repository.getResource<MajdataSnapshot>(majdataAccountKey(id), 1); }
export function clearMajdataAccount(id: string) {
  accountRequests.set(id, (accountRequests.get(id) ?? 0) + 1);
  return repository.clearResources([majdataAccountKey(id)]);
}

export async function loadMajdataFresh(id: string, session: HttpCookieSession, signal?: AbortSignal): Promise<MajdataSnapshot> {
  const generation = (accountRequests.get(id) ?? 0) + 1;
  accountRequests.set(id, generation);
  const assertGeneration = captureResourceWrites('majdata-net', signal, id);
  const assertCurrent = () => {
    assertGeneration();
    if (accountRequests.get(id) !== generation) throw new Error('请求已失效');
  };
  let expected = session;
  const provider = new MajdataProvider(session, async next => {
    assertCurrent();
    const state = useSession.getState();
    if (signal?.aborted || accountRequests.get(id) !== generation || state.sessionsByAccountId[id] !== expected) return;
    await applyMajdataSessionRotation(id, next, expected, signal);
    assertCurrent();
    expected = useSession.getState().sessionsByAccountId[id]?.mode === 'http-cookies'
      ? useSession.getState().sessionsByAccountId[id] as HttpCookieSession : expected;
  });
  const player = await provider.getPlayer(signal);
  const records = await provider.getRecords(signal);
  const recent = await provider.getRecent(player.username, signal);
  assertCurrent();
  const snapshot = { player, records, recent, source: majdataSource() };
  await repository.saveResource(majdataAccountKey(id), 1, snapshot.source.updatedAt, snapshot, assertCurrent);
  assertCurrent();
  return snapshot;
}

function loadMajdataCachedSong(id: string): Promise<MajdataSongSnapshot | null> {
  return repository.getResource(majdataSongKey(id), 1, songSnapshotSchema);
}

export async function loadMajdataSongSnapshot(id: string): Promise<{
  song: MajdataSong;
  source: DataSource;
  metadata: SnapshotMetadata;
} | null> {
  const cached = await loadMajdataCachedSong(id);
  if (!cached) return null;
  return {
    song: cached.song,
    source: cached.source,
    metadata: snapshotMetadataOf(cached.source, cached.song.hash),
  };
}

/** 一次歌曲读取：数据本身加上它是否来自本地快照。 */
type MajdataSongLoad = { song: MajdataSong; fromCache: boolean; source: DataSource };

function cachedSongLoad(snapshot: MajdataSongSnapshot): MajdataSongLoad {
  return {
    song: snapshot.song,
    fromCache: true,
    source: cachedSnapshotSource(snapshot.source),
  };
}

/**
 * 歌曲详情与谱面文本的共享请求入口。
 * 网络失败时回退本地快照，回退结果带 `fromCache` 与过期来源，调用端不得把它当成刷新成功。
 */
async function loadMajdataSongCurrent(id: string, signal?: AbortSignal): Promise<MajdataSongLoad> {
  const assertCurrent = captureResourceWrites('majdata-net');
  return resourceLoads.share(requestKey(majdataSongKey(id)), async requestSignal => {
    const foregroundSignal = getForegroundAbortSignal();
    const generation = (songRequests.get(id) ?? 0) + 1;
    songRequests.set(id, generation);
    const assertSongCurrent = () => {
      if (requestSignal.aborted) throw requestSignal.reason;
      if (foregroundSignal.aborted) throw foregroundSignal.reason;
      assertCurrent();
      if (songRequests.get(id) !== generation) throw new Error('请求已失效');
    };
    const cached = await loadMajdataCachedSong(id);
    try {
      const song = await requestMajdataSong(id, requestSignal, foregroundSignal, assertSongCurrent);
      assertSongCurrent();
      const source = majdataSource();
      assertFreshSnapshotSource(source);
      const snapshot = { song, source };
      await repository.saveResource(majdataSongKey(id), 1, source.updatedAt, snapshot, assertSongCurrent);
      assertSongCurrent();
      await repository.saveResource(`${majdataSongKey(id)}:${song.hash}`, 1, source.updatedAt, snapshot, assertSongCurrent);
      assertSongCurrent();
      return { song, fromCache: false, source };
    } catch (error) {
      assertSongCurrent();
      if (cached && !requestSignal?.aborted && songRequests.get(id) === generation) return cachedSongLoad(cached);
      throw error;
    }
  }, signal);
}

export async function loadMajdataSong(
  id: string,
  signal?: AbortSignal,
  onFresh?: (song: MajdataSong) => void,
  onFallback?: (song: MajdataSong) => void,
): Promise<MajdataSong> {
  if (onFresh || onFallback) {
    const assertCurrent = captureResourceWrites('majdata-net');
    const result = await cacheFirstLoad<MajdataSongLoad>({
      loadCached: async () => {
        const cached = await loadMajdataSongSnapshot(id);
        return cached ? { song: cached.song, fromCache: true, source: cachedSnapshotSource(cached.source) } : null;
      },
      loadFresh: requestSignal => loadMajdataSongCurrent(id, requestSignal),
      // 服务自己声明哪份数据来自本地快照，兜底不会被包装成刷新成功。
      isFallback: value => value.fromCache,
      onFresh: value => { assertCurrent(); onFresh?.(value.song); },
      onFallback: value => { assertCurrent(); onFallback?.(value.song); },
      markStale: value => ({ ...value, source: cachedSnapshotSource(value.source) }),
      signal,
    });
    assertCurrent();
    return result.song;
  }
  return (await loadMajdataSongCurrent(id, signal)).song;
}

export async function loadMajdataChart(song: MajdataSong, signal?: AbortSignal): Promise<string> {
  const key = `majdata-net:chart:${song.id}:${song.hash}`;
  const assertCurrent = captureResourceWrites('majdata-net');
  return resourceLoads.share(requestKey(key), async requestSignal => {
    const foregroundSignal = getForegroundAbortSignal();
    const assertChartCurrent = () => {
      if (requestSignal.aborted) throw requestSignal.reason;
      if (foregroundSignal.aborted) throw foregroundSignal.reason;
      assertCurrent();
    };
    const cached = await repository.getResource<string>(key, 1);
    if (requestSignal.aborted) throw requestSignal.reason;
    assertCurrent();
    if (cached) return cached;
    const text = await majdataProvider.getChart(song.id, requestSignal);
    const current = await requestMajdataSong(song.id, requestSignal, foregroundSignal, assertChartCurrent);
    if (current.hash !== song.hash) throw new Error('谱面已更新，请刷新歌曲后重试');
    if (requestSignal.aborted) throw requestSignal.reason;
    assertCurrent();
    await repository.saveResource(key, 1, new Date().toISOString(), text, () => { assertCurrent(); if (requestSignal.aborted) throw new Error('已取消'); });
    if (requestSignal.aborted) throw requestSignal.reason;
    assertCurrent();
    return text;
  }, signal);
}

export async function loadMajdataParsedChart(song: MajdataSong, level: number, signal?: AbortSignal) {
  if (!Number.isInteger(level) || level < 0 || level > 6) throw new Error('所选难度不存在');
  const key = `majdata-net:parsed:${song.id}:${song.hash}:${level}`;
  const assertCurrent = captureResourceWrites('majdata-net');
  return resourceLoads.share(requestKey(key), async requestSignal => {
    type Parsed = { chart: ReturnType<typeof parseSimaiChart>; statistics: ReturnType<typeof simaiStatistics> };
    const cached = await repository.getResource<Parsed>(key, 1);
    if (requestSignal.aborted) throw requestSignal.reason;
    assertCurrent();
    if (cached) return cached;
    const chart = parseSimaiChart(await loadMajdataChart(song, requestSignal), level + 1);
    const parsed = { chart, statistics: simaiStatistics(chart) };
    if (requestSignal.aborted) throw requestSignal.reason;
    assertCurrent();
    await repository.saveResource(key, 1, new Date().toISOString(), parsed, () => { assertCurrent(); if (requestSignal.aborted) throw new Error('已取消'); });
    if (requestSignal.aborted) throw requestSignal.reason;
    assertCurrent();
    return parsed;
  }, signal);
}
