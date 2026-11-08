import { readMaimaiSave } from '@rranker/tool-maimai/services/maimai-save';
import { convertHubScoresToLxnsRecords } from '@rranker/tool-maimai/services/score-hub-sync-map';

const native = vi.hoisted(() => ({ readSaveAsync: vi.fn() }));
vi.mock('expo-modules-core', () => ({ requireOptionalNativeModule: () => native }));

it('maps standard, DX and UTAGE records to the shared score writer', async () => {
  native.readSaveAsync.mockResolvedValue(JSON.stringify({ logout_confirmed: true, scores: [
    { id: 12, type: 'standard', level_index: 3, achievements: 100.5, dx_score: 2100, fc: 'app', fs: 'fdxp' },
    { id: 1696, type: 'dx', level_index: 4, achievements: 99.8, dx_score: 1900, fc: 'fc', fs: null },
    { id: 100001, type: 'utage', level_index: 0, achievements: 98.7, dx_score: 1100, fc: null, fs: 'fs' },
  ] }));
  const save = await readMaimaiSave('synthetic-code');
  const mapped = convertHubScoresToLxnsRecords(save.scores);
  expect(mapped.records).toEqual([
    expect.objectContaining({ id: 12, type: 'standard', level_index: 3, achievements: 100.5, fc: 'app' }),
    expect.objectContaining({ id: 1696, type: 'dx', level_index: 4, achievements: 99.8 }),
    expect.objectContaining({ id: 100001, type: 'utage', level_index: 0, achievements: 98.7 }),
  ]);
});

it.each([
  [0, 0], [23, 23], [null, undefined], [undefined, undefined], [24, undefined],
])('preserves course rank %s without inventing a missing rank', async (courseRank, expected) => {
  native.readSaveAsync.mockResolvedValue(JSON.stringify({
    logout_confirmed: true, player: { course_rank: courseRank }, scores: [],
  }));
  expect((await readMaimaiSave('synthetic-code')).courseRank).toBe(expected);
});

it.each([
  [{ error: { code: 'QR_FAILED', status: 503, nativeCode: 1 } }, { code: 'QR_FAILED', status: 503, nativeCode: 1 }],
  [{ scores: [], logout_confirmed: false }, { code: 'CLEANUP_FAILED' }],
  [{ scores: 'private-content' }, { code: 'INVALID_RESPONSE' }],
])('exposes only public failure fields', async (response, expected) => {
  native.readSaveAsync.mockResolvedValue(JSON.stringify(response));
  await expect(readMaimaiSave('synthetic-code')).rejects.toMatchObject(expected);
});
