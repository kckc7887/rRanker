const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('expo/fetch', () => ({ fetch: fetchMock }));

import {
  isRetryableScoreHubError,
  pollUpdateScoreUntilDone,
  ScoreHubError,
} from '@/services/score-hub-client';

function jsonResponse(status: number, body: unknown) {
  return {
    status,
    text: async () => JSON.stringify(body),
  };
}

describe('score-hub poll resilience', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('treats terminated / fetch failed as retryable', () => {
    expect(isRetryableScoreHubError(new ScoreHubError('fetch failed: terminated', undefined, true))).toBe(true);
    expect(isRetryableScoreHubError(new Error('terminated'))).toBe(true);
    expect(isRetryableScoreHubError(new ScoreHubError('已取消'))).toBe(false);
    expect(isRetryableScoreHubError(new ScoreHubError('获取成绩失败'))).toBe(false);
  });

  it('continues polling after a terminated network error', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('terminated'))
      .mockResolvedValueOnce(jsonResponse(200, {
        status: 'processing',
        stage: 'update_score',
        scoreProgress: { completedDiffs: [0], totalDiffs: 6 },
      }))
      .mockResolvedValueOnce(jsonResponse(200, {
        status: 'completed',
        stage: 'update_score',
        scoreProgress: { completedDiffs: [0, 1, 2, 3, 4, 10], totalDiffs: 6 },
      }));

    const onProgress = vi.fn();
    const done = pollUpdateScoreUntilDone({
      token: 'tok',
      jobId: 'job-1',
      onProgress,
    });

    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(5_000);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(done).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      stage: '网络连接中断，正在重试…',
    }));
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      status: 'completed',
    }));
  });
});
