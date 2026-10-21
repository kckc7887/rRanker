import { createHash } from 'node:crypto';
import { jest } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react-native';
import { useGameResourceSync } from '@/hooks/use-game-resource-sync';
import { queryClient } from '@/state/query-client';
import { phigrosResources } from '@/services/phigros-resources';
import { rizlineResources } from '@/services/rizline-resources';
import { PHIGROS_CATALOG_QUERY_KEY, type PhigrosCatalogData } from '@/services/phigros-catalog-query';
import { RIZLINE_CATALOG_QUERY_KEY } from '@/services/rizline-catalog-query';
import type { RizlineCatalogData } from '@/domain/rizline';
import { releaseFixture } from './fixtures/phigros-release';
import { rizlineCatalog } from './fixtures/rizline';

let mockGame = 'phigros';
let mockReady = true;
let mockRestore = 'ready';
jest.mock('@/state/session-store', () => ({
  useSession: Object.assign((select: (value: unknown) => unknown) => select({ activeGameId: mockGame, restoreStatus: mockRestore }),
    { getState: () => ({ catalogProvider: null }) }),
}));
jest.mock('@/state/app-lifecycle', () => ({ useAppLifecycle: () => ({ foregroundReady: mockReady }) }));
jest.mock('expo-sqlite', () => jest.requireActual('./expo-sqlite-shim'));
jest.mock('expo-sqlite/kv-store', () => jest.requireActual('./expo-sqlite-kv-store-shim'));

function rizlineRelease(revision: string): Map<string, string> {
  const hash = (text: string) => createHash('sha256').update(text).digest('hex');
  const snapshot = rizlineCatalog(revision);
  const audioPath = `rizline/audio/${hash('audio')}.m4a`;
  const chartPath = `rizline/charts/${hash('{}')}.json`;
  snapshot.songs[0]!.audioPath = audioPath;
  snapshot.songs[0]!.charts[0]!.chartPath = chartPath;
  const catalog = JSON.stringify(snapshot);
  const catalogPath = `rizline/metadata/${hash(catalog)}.json`;
  const manifest = JSON.stringify({ schemaVersion: 2, resourceVersion: revision, gameVersion: '2.7.1', catalogPath,
    files: [{ path: catalogPath, size: Buffer.byteLength(catalog), sha256: hash(catalog) },
      { path: audioPath, size: 5, sha256: hash('audio') },
      { path: chartPath, size: 2, sha256: hash('{}') }] });
  const manifestPath = `rizline/manifests/${hash(manifest)}.json`;
  return new Map([
    ['/rizline/latest.json', JSON.stringify({ schemaVersion: 2, resourceVersion: revision,
      manifestPath, manifestSha256: hash(manifest) })],
    [`/${manifestPath}`, manifest], [`/${catalogPath}`, catalog],
  ]);
}

let phigrosRelease: ReturnType<typeof releaseFixture>;
let rizlineFiles: Map<string, string>;
const requests: string[] = [];
beforeEach(() => {
  mockGame = 'phigros'; mockReady = true; mockRestore = 'ready';
  queryClient.clear(); phigrosResources.clear(); rizlineResources.clear();
  phigrosRelease = releaseFixture('r1', ['Old.Song']);
  rizlineFiles = rizlineRelease('r1');
  requests.length = 0;
  jest.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const path = new URL(String(input)).pathname;
    requests.push(path);
    if (path.startsWith('/phigros/')) return phigrosRelease.respond(input);
    const body = rizlineFiles.get(path);
    return body ? new Response(body) : new Response('', { status: 404 });
  });
});
afterEach(async () => {
  await queryClient.cancelQueries();
  queryClient.clear(); phigrosResources.clear(); rizlineResources.clear();
  jest.restoreAllMocks();
});

it('恢复账号并进入前台后发布 Phigros 曲库，重新进入游戏时读取更新', async () => {
  mockRestore = 'restoring'; mockReady = false;
  const hook = await renderHook(() => useGameResourceSync());
  const songs = () => queryClient.getQueryData<PhigrosCatalogData>(PHIGROS_CATALOG_QUERY_KEY)?.snapshot.songs.map(song => song.id);
  expect(songs()).toBeUndefined();
  expect(requests).toEqual([]);
  mockRestore = 'ready';
  await hook.rerender(undefined);
  expect(requests).toEqual([]);
  mockReady = true;
  await hook.rerender(undefined);
  await waitFor(() => expect(songs()).toEqual(['Old.Song']));
  await waitFor(() => expect(queryClient.isFetching()).toBe(0));

  phigrosRelease = releaseFixture('r2', ['Old.Song', 'New.Song']);
  requests.length = 0;
  await hook.rerender(undefined);
  mockReady = false; await hook.rerender(undefined);
  mockReady = true; await hook.rerender(undefined);
  expect(songs()).toEqual(['Old.Song']);
  expect(requests).toEqual([]);
  mockGame = 'osu-standard'; await hook.rerender(undefined);
  mockGame = 'phigros'; await hook.rerender(undefined);
  await waitFor(() => expect(songs()).toEqual(['Old.Song', 'New.Song']));
  await waitFor(() => expect(queryClient.isFetching()).toBe(0));
  await hook.unmount();
});

it('进入 Rizline 时发布所属曲库，普通前台恢复不重复下载，重新进入取得新版本', async () => {
  mockGame = 'rizline';
  const revision = () => queryClient.getQueryData<RizlineCatalogData>(RIZLINE_CATALOG_QUERY_KEY)?.snapshot.resourceVersion;
  const hook = await renderHook(() => useGameResourceSync());
  await waitFor(() => {
    expect(queryClient.getQueryState(RIZLINE_CATALOG_QUERY_KEY)?.error).toBeNull();
    expect(revision()).toBe('r1');
  });
  await waitFor(() => expect(queryClient.isFetching()).toBe(0));
  expect(queryClient.getQueryData(PHIGROS_CATALOG_QUERY_KEY)).toBeUndefined();
  rizlineFiles = rizlineRelease('r2');
  requests.length = 0;
  mockReady = false; await hook.rerender(undefined);
  mockReady = true; await hook.rerender(undefined);
  expect(revision()).toBe('r1');
  expect(requests).toEqual([]);
  mockGame = 'osu-standard'; await hook.rerender(undefined);
  mockGame = 'rizline'; await hook.rerender(undefined);
  await waitFor(() => expect(revision()).toBe('r2'));
  await waitFor(() => expect(queryClient.isFetching()).toBe(0));
  await hook.unmount();
});
