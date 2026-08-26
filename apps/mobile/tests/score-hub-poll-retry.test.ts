import {
  createCabinetScoreJob,
  createUpdateScoreJob,
  isRetryableScoreHubError,
  pollCabinetScoreJobUntilDone,
  pollUpdateScoreUntilDone,
  ScoreHubError,
} from '@/services/score-hub-client';

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('expo/fetch', () => ({ fetch: fetchMock }));

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

  it('创建 DXNet 成绩任务时显式提交全部难度', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { jobId: 'job-all-diffs' }));

    await expect(createUpdateScoreJob('tok', 'friendship-job')).resolves.toBe('job-all-diffs');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/me/dxnet-jobs'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          jobType: 'update_score',
          diffsToScrape: [0, 1, 2, 3, 4, 10],
          friendshipJobId: 'friendship-job',
        }),
      }),
    );
  });

  it('创建二维码成绩任务时只提交当前二维码', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(202, {
      jobId: 'cabinet-job',
      job: {
        id: 'cabinet-job',
        status: 'queued',
        stage: 'queued',
        cleanupStatus: 'not_required',
        progress: null,
        syncId: null,
        scoreCount: null,
        error: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }));

    await expect(createCabinetScoreJob(
      'tok',
      { kind: 'text', qrCode: ' SGWCMAIDCURRENT ' },
    )).resolves.toEqual(expect.objectContaining({ id: 'cabinet-job' }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/me/cabinet-score-jobs'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ qrCode: 'SGWCMAIDCURRENT' }),
      }),
    );
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

  it('二维码任务失败后等待收尾完成再结束', async () => {
    const createdAt = new Date().toISOString();
    const initial = {
      id: 'cabinet-cleanup',
      status: 'failed' as const,
      stage: 'cleanup' as const,
      cleanupStatus: 'pending' as const,
      progress: { detailsFetched: 120 },
      syncId: null,
      scoreCount: null,
      error: { code: 'SESSION_CLEANUP_PENDING', retryAfter: null },
      createdAt,
      updatedAt: createdAt,
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {
      ...initial,
      cleanupStatus: 'succeeded',
      error: { code: 'WORKER_INTERRUPTED_SESSION_CLEANED', retryAfter: null },
    }));

    const done = pollCabinetScoreJobUntilDone({ token: 'tok', job: initial });
    const expectation = expect(done).rejects.toMatchObject({
      code: 'WORKER_INTERRUPTED_SESSION_CLEANED',
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await expectation;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
