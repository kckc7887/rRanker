import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OsuScoreProvider } from '@/providers/osu-score-provider';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('expo/fetch', () => ({ fetch: mocks.fetch }));

const session = {
  mode: 'osu-oauth',
  accessToken: 'access',
  refreshToken: 'refresh',
  expiresAt: Date.now() + 3_600_000,
  persistable: true,
} as const;

describe('OsuScoreProvider 单谱玩家成绩', () => {
  beforeEach(() => {
    mocks.fetch.mockReset();
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
  });

  it('按谱面查询玩家成绩并将未游玩的 404 归一化为空', async () => {
    mocks.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        position: 1,
        score: { id: 9, accuracy: 0.98, total_score: 123, rank: 'S' },
      }),
    });
    const provider = new OsuScoreProvider(session);
    expect((await provider.getUserBeatmapScore(2, 22423, 'osu-standard'))?.id).toBe(9);
    expect(String(mocks.fetch.mock.calls[0]?.[0]))
      .toContain('/beatmaps/22423/scores/users/2?mode=osu');

    mocks.fetch.mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(provider.getUserBeatmapScore(2, 22424, 'osu-standard')).resolves.toBeNull();
  });

  it('携带同一授权流式写入完整 beatmapset 并报告进度', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    mocks.fetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-length': String(bytes.byteLength) }),
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes.subarray(0, 2));
          controller.enqueue(bytes.subarray(2));
          controller.close();
        },
      }),
    });
    const written: number[] = [];
    const destination = {
      exists: false,
      size: 0,
      create() {},
      writableStream() {
        return new WritableStream<Uint8Array>({
          write(chunk) { written.push(...chunk); },
          close: () => {
            destination.exists = true;
            destination.size = written.length;
          },
        });
      },
    } as unknown as import('expo-file-system').File;
    const progress: number[] = [];

    await new OsuScoreProvider(session).downloadBeatmapsetArchive(
      3720,
      destination,
      undefined,
      (value) => progress.push(value),
    );

    expect(written).toEqual([1, 2, 3, 4]);
    expect(progress.at(-1)).toBe(1);
    expect(String(mocks.fetch.mock.calls[0]?.[0])).toContain('/beatmapsets/3720/download');
    expect(mocks.fetch.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({ Authorization: 'Bearer access' }),
    });
  });

  it('下载权限不足时保留 permission 错误供界面提示重新绑定', async () => {
    mocks.fetch.mockResolvedValueOnce({ ok: false, status: 403 });
    const destination = {} as import('expo-file-system').File;

    await expect(new OsuScoreProvider(session).downloadBeatmapsetArchive(3720, destination))
      .rejects.toMatchObject({ code: 'permission' });
  });
});
