import type { MajdataSnapshot, MajdataSong } from '@/domain/majdata';
import type { DataSource } from '@/domain/models';
import type { HttpCookieSession } from '@/providers/http-cookies';
import { MajdataProvider, majdataProvider } from '@/providers/majdata-provider';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { SecureSessionStore } from '@/storage/secure-session-store';
import { useSession } from '@/state/session-store';
import { snapshotSource, captureResourceWrites, createInflightGuard, resourceWriteGeneration } from './snapshot-cache-utils';
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
const requestKey = (key: string) => `${resourceWriteGeneration('majdata-net')}:${key}`;
const repository = new SqliteSnapshotRepository();
const songRequests = new Map<string, number>();
const accountRequests = new Map<string, number>();
export const majdataSource = () => snapshotSource({ kind: 'majdata-net', label: 'Majdata Net' });
export const majdataAccountKey = (id: string) => `majdata-net:account:${id}`;
export const majdataSongKey = (id: string) => `majdata-net:song:${id}`;

/** 歌曲快照的本地载荷：谱面本体加它被抓取时的来源元数据（旧版本行没有来源）。 */
type MajdataSongSnapshot = { song: MajdataSong; source?: DataSource };

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
    useSession.setState({ sessionsByAccountId: { ...state.sessionsByAccountId, [id]: next },
      ...(state.activeAccountId === id ? { session: next } : {}) });
    expected = next;
    await new SecureSessionStore().updateAccountSession(id, next);
  });
  const player = await provider.getPlayer(signal);
  const records = await provider.getRecords(signal);
  const recent = await provider.getRecent(player.username, signal);
  if (signal?.aborted) throw signal.reason;
  assertCurrent();
  if (accountRequests.get(id) !== generation) throw new Error('请求已失效');
  const snapshot = { player, records, recent, source: majdataSource() };
  await repository.saveResource(majdataAccountKey(id), 1, snapshot.source.updatedAt, snapshot, assertCurrent);
  if (signal?.aborted) throw signal.reason;
  assertCurrent();
  if (accountRequests.get(id) !== generation) throw new Error('请求已失效');
  return snapshot;
}

export function loadMajdataCachedSong(id: string) { return repository.getResource<MajdataSongSnapshot>(majdataSongKey(id), 1); }

/**
 * 本地歌曲快照：歌曲本体、展示来源与快照元数据。
 * 缓存读取保留原提供方与抓取时间，可用修订就是谱面 hash；
 * 旧版本行没有来源信息时不编造元数据（metadata 为 null），展示来源退回本次读取的来源。
 */
export async function loadMajdataSongSnapshot(id: string): Promise<{
  song: MajdataSong;
  source: DataSource;
  metadata: SnapshotMetadata | null;
} | null> {
  const cached = await loadMajdataCachedSong(id);
  if (!cached) return null;
  const stored = cached.source && cached.source.kind !== 'cache' ? cached.source : null;
  return {
    song: cached.song,
    source: stored ?? majdataSource(),
    metadata: stored ? snapshotMetadataOf(stored, cached.song.hash) : null,
  };
}

/** 一次歌曲读取：数据本身加上它是否来自本地快照。 */
type MajdataSongLoad = { song: MajdataSong; fromCache: boolean; source: DataSource };

function cachedSongLoad(snapshot: MajdataSongSnapshot): MajdataSongLoad {
  return {
    song: snapshot.song,
    fromCache: true,
    source: cachedSnapshotSource(snapshot.source ?? majdataSource()),
  };
}

/**
 * 歌曲详情与谱面文本的共享请求入口。
 * 网络失败时回退本地快照，回退结果带 `fromCache` 与过期来源，调用端不得把它当成刷新成功。
 */
async function loadMajdataSongCurrent(id: string, signal?: AbortSignal): Promise<MajdataSongLoad> {
  const assertCurrent = captureResourceWrites('majdata-net');
  return resourceLoads.share(requestKey(majdataSongKey(id)), async requestSignal => {
    const generation = (songRequests.get(id) ?? 0) + 1;
    songRequests.set(id, generation);
    const assertSongCurrent = () => {
      if (requestSignal.aborted) throw requestSignal.reason;
      assertCurrent();
      if (songRequests.get(id) !== generation) throw new Error('请求已失效');
    };
    const cached = await repository.getResource<MajdataSongSnapshot>(majdataSongKey(id), 1);
    try {
      const song = await majdataProvider.getSong(id, requestSignal);
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
      assertCurrent();
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
    const cached = await repository.getResource<string>(key, 1);
    if (requestSignal.aborted) throw requestSignal.reason;
    assertCurrent();
    if (cached) return cached;
    const text = await majdataProvider.getChart(song.id, requestSignal);
    const current = await majdataProvider.getSong(song.id, requestSignal);
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
