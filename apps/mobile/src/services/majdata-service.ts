import type { MajdataSnapshot, MajdataSong } from '@/domain/majdata';
import type { HttpCookieSession } from '@/providers/http-cookies';
import { MajdataProvider, majdataProvider } from '@/providers/majdata-provider';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { SecureSessionStore } from '@/storage/secure-session-store';
import { useSession } from '@/state/session-store';
import { snapshotSource, captureResourceWrites, createInflightGuard, resourceWriteGeneration } from './snapshot-cache-utils';
import { parseSimaiChart } from '@/features/simai-chart-preview/engine/core/parser/SimaiParser';
import { simaiStatistics } from '@/features/simai-chart-preview/statistics';
import { cacheFirstLoad } from './cache-first';

const resourceLoads = createInflightGuard<string>();
const requestKey = (key: string) => `${resourceWriteGeneration('majdata-net')}:${key}`;
const repository = new SqliteSnapshotRepository();
const songRequests = new Map<string, number>();
const accountRequests = new Map<string, number>();
export const majdataSource = () => snapshotSource({ kind: 'majdata-net', label: 'Majdata Net' });
export const majdataAccountKey = (id: string) => `majdata-net:account:${id}`;
export const majdataSongKey = (id: string) => `majdata-net:song:${id}`;
export function loadMajdataCached(id: string) { return repository.getResource<MajdataSnapshot>(majdataAccountKey(id), 1); }
export function clearMajdataAccount(id: string) {
  accountRequests.set(id, (accountRequests.get(id) ?? 0) + 1);
  return repository.clearResources([majdataAccountKey(id)]);
}

export async function loadMajdataFresh(id: string, session: HttpCookieSession, signal?: AbortSignal): Promise<MajdataSnapshot> {
  const generation = (accountRequests.get(id) ?? 0) + 1;
  accountRequests.set(id, generation);
  const assertCurrent = captureResourceWrites('majdata-net');
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
  await repository.saveResource(majdataAccountKey(id), 1, snapshot.source.updatedAt, snapshot);
  if (signal?.aborted) throw signal.reason;
  assertCurrent();
  if (accountRequests.get(id) !== generation) throw new Error('请求已失效');
  return snapshot;
}

export function loadMajdataCachedSong(id: string) { return repository.getResource<{ song: MajdataSong }>(majdataSongKey(id), 1); }

export async function loadMajdataSong(id: string, signal?: AbortSignal, onFresh?: (song: MajdataSong) => void): Promise<MajdataSong> {
  const assertCurrent = captureResourceWrites('majdata-net');
  if (onFresh) {
    const result = await cacheFirstLoad({
      loadCached: async () => { const cached = await loadMajdataCachedSong(id); return cached ? { ...cached, source: majdataSource() } : null; },
      loadFresh: async requestSignal => ({ song: await loadMajdataSong(id, requestSignal), source: majdataSource() }),
      onFresh: value => { assertCurrent(); onFresh(value.song); }, signal,
    });
    assertCurrent();
    return result.song;
  }
  return resourceLoads.share(requestKey(majdataSongKey(id)), async requestSignal => {
    const generation = (songRequests.get(id) ?? 0) + 1;
    songRequests.set(id, generation);
    const assertSongCurrent = () => {
      if (requestSignal.aborted) throw requestSignal.reason;
      assertCurrent();
      if (songRequests.get(id) !== generation) throw new Error('请求已失效');
    };
    const cached = await repository.getResource<{ song: MajdataSong }>(majdataSongKey(id), 1);
    try {
      const song = await majdataProvider.getSong(id, requestSignal);
      assertSongCurrent();
      await repository.saveResource(majdataSongKey(id), 1, new Date().toISOString(), { song });
      assertSongCurrent();
      await repository.saveResource(`${majdataSongKey(id)}:${song.hash}`, 1, new Date().toISOString(), { song });
      assertSongCurrent();
      return song;
    } catch (error) { assertCurrent(); if (cached && !requestSignal?.aborted && songRequests.get(id) === generation) return cached.song; throw error; }
  }, signal);
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
    await repository.saveResource(key, 1, new Date().toISOString(), text);
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
    await repository.saveResource(key, 1, new Date().toISOString(), parsed);
    if (requestSignal.aborted) throw requestSignal.reason;
    assertCurrent();
    return parsed;
  }, signal);
}
