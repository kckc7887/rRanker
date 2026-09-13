import { beforeEach, expect, it, vi } from 'vitest';
import { phigrosPayloadFromSnapshot } from '@/domain/game-data';
import { loadPhigrosGameData } from '@/services/phigros-game-data-service';
import type { PhigrosGameDataPayload } from '@/domain/game-data';
import type { PhigrosSummary } from '@/domain/phigros';

const release = vi.hoisted(() => ({ current: { revision: 'r1' } }));
const loadRelease = vi.hoisted(() => vi.fn(async (_signal?: AbortSignal) => release.current));
const avatar = vi.hoisted(() => vi.fn(async () => 'avatar'));
vi.mock('@/services/phigros-resources', () => ({ phigrosResources: { load: loadRelease, peek: () => release.current } }));
vi.mock('@/domain/phigros-avatar-resolver', () => ({ resolvePhigrosAvatarUrl: avatar }));
vi.mock('expo-sqlite', () => ({ openDatabaseAsync: vi.fn() }));

const source = { kind: 'generated' as const, label: 'TapTap云存档', updatedAt: '2026-09-13T00:00:00Z', isStale: false };
const player = { id: 'player', displayName: 'Player', rating: 15.4321, additionalRating: 0, source };
const summary: PhigrosSummary = { saveVersion: 1, challengeModeRank: 201, rankingScore: 15.4321, gameVersion: 301,
  avatar: 'summary-avatar', cleared: [1, 2, 3, 4], fullCombo: [0, 1, 2, 3], phi: [0, 0, 1, 2] };

function setup(stored: PhigrosGameDataPayload | null = null) {
  const controller = new AbortController();
  const scoreProvider = {
    invalidateCache: vi.fn(),
    getPlayer: vi.fn(async () => player),
    getRecords: vi.fn(async () => []),
    getBestSections: vi.fn(async () => []),
    getSummary: vi.fn(async () => summary),
    getUserProfile: vi.fn(async () => ({ avatar: 'profile-avatar', backgroundSongId: 'song', selfIntro: '', showPlayerId: false })),
    getGameProgress: vi.fn(async () => null),
    getSaveUpdatedAt: vi.fn(() => source.updatedAt),
  };
  const options = {
    accountId: 'phi-account', scoreProvider,
    catalogProvider: { getGameVersion: vi.fn(async () => '3.0.1'), getResourceUpdatedAt: vi.fn(() => 'catalog-time') },
    cache: { load: vi.fn(async () => stored), save: vi.fn(async (_id: string, _payload: PhigrosGameDataPayload, _assertCurrent?: () => void) => undefined) },
    hasSessionData: false, signal: controller.signal,
    assertCurrent: vi.fn(() => { if (controller.signal.aborted) throw controller.signal.reason; }),
  };
  return { options, controller };
}

function cached(revision = 'r1') {
  return phigrosPayloadFromSnapshot({ player, records: [], bestSections: [], challengeModeRank: 201, source,
    progress: { cleared: summary.cleared, fullCombo: summary.fullCombo, phi: summary.phi } }, source, { resourceRevision: revision });
}

beforeEach(() => {
  vi.clearAllMocks();
  release.current = { revision: 'r1' };
  loadRelease.mockImplementation(async () => release.current);
  avatar.mockResolvedValue('avatar');
});

it('uses a compatible first-load snapshot without reloading the cloud save', async () => {
  const { options } = setup(cached());
  const result = await loadPhigrosGameData(options);
  expect(result.source.isStale).toBe(true);
  expect(result.catalogSource.isStale).toBe(true);
  expect(options.scoreProvider.invalidateCache).not.toHaveBeenCalled();
  expect(options.cache.save).not.toHaveBeenCalled();
});

it('keeps the offline snapshot when revision verification is unavailable', async () => {
  loadRelease.mockRejectedValueOnce(new Error('offline'));
  const { options } = setup(cached('older'));
  expect((await loadPhigrosGameData(options)).resourceRevision).toBe('older');
  expect(options.scoreProvider.getPlayer).not.toHaveBeenCalled();
});

it.each([false, true])('reloads changed revisions and explicit syncs, preserving display metadata (session data %s)', async (hasSessionData) => {
  const { options } = setup(cached('older'));
  options.hasSessionData = hasSessionData;
  const result = await loadPhigrosGameData(options);
  expect(result).toMatchObject({ resourceRevision: 'r1', playerScore: { display: '15.4321' }, dataAmount: '0KiB',
    avatarUrl: 'avatar', avatarKey: 'profile-avatar', backgroundSongId: 'song', saveUpdatedAt: source.updatedAt,
    catalogSource: { label: 'Phigros3.0.1', updatedAt: 'catalog-time', isStale: false }, progress: { cleared: [1, 2, 3, 4] } });
  expect(options.scoreProvider.getPlayer).toHaveBeenCalledWith(options.signal);
  expect(options.scoreProvider.invalidateCache).toHaveBeenCalledTimes(1);
  expect(options.cache.load).toHaveBeenCalledTimes(hasSessionData ? 0 : 1);
  expect(options.cache.save).toHaveBeenCalledWith('phi-account', result, expect.any(Function));
});

it('does not turn cancellation into an offline-cache success', async () => {
  const { options, controller } = setup(cached());
  loadRelease.mockImplementationOnce(async () => { controller.abort(new Error('cancelled')); throw controller.signal.reason; });
  await expect(loadPhigrosGameData(options)).rejects.toThrow('cancelled');
  expect(options.cache.save).not.toHaveBeenCalled();
});

it.each(['cancel', 'revision', 'generation'])('rejects stale work after the asynchronous avatar lookup (%s)', async (change) => {
  const { options, controller } = setup();
  let entered!: () => void;
  const ready = new Promise<void>((resolve) => { entered = resolve; });
  let finish!: (value: string) => void;
  avatar.mockImplementationOnce(() => { entered(); return new Promise((resolve) => { finish = resolve; }); });
  const result = loadPhigrosGameData(options);
  await ready;
  if (change === 'cancel') controller.abort(new Error('cancelled'));
  if (change === 'revision') release.current = { revision: 'r2' };
  if (change === 'generation') options.assertCurrent.mockImplementation(() => { throw new Error('cleared'); });
  finish('late-avatar');
  await expect(result).rejects.toThrow();
  expect(options.cache.save).not.toHaveBeenCalled();
});

it('checks the resource revision again when a queued repository write commits', async () => {
  const { options } = setup();
  await loadPhigrosGameData(options);
  const assertCurrent = options.cache.save.mock.calls[0]![2]!;
  release.current = { revision: 'r2' };
  expect(assertCurrent).toThrow('Phigros release changed');
});
