const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('expo/fetch', () => ({ fetch: fetchMock }));

import {
  isQrExpiredErrorBody,
  loginByQr,
  loginByQrUntilToken,
  parseQrLoginInitBody,
  pollQrLoginUntilToken,
} from '@/services/score-hub-client';

function jsonResponse(status: number, body: unknown) {
  return {
    status,
    text: async () => JSON.stringify(body),
  };
}

describe('score-hub qr-login', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('解析 fast / async / 过期响应', () => {
    expect(parseQrLoginInitBody(201, {
      kind: 'fast',
      token: 'tok-fast',
      user: { friendCode: '123456789012345' },
    })).toEqual({
      kind: 'fast',
      token: 'tok-fast',
      friendCode: '123456789012345',
    });
    expect(parseQrLoginInitBody(201, {
      kind: 'async',
      attemptId: 'attempt-1',
    })).toEqual({
      kind: 'async',
      attemptId: 'attempt-1',
    });
    expect(isQrExpiredErrorBody({
      message: { code: 'qr_expired', message: '二维码已过期' },
    })).toBe(true);
    expect(() => parseQrLoginInitBody(400, {
      message: { code: 'qr_expired', message: '二维码已过期' },
    })).toThrow(/玩家二维码/);
  });

  it('文本凭证走 JSON POST', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, {
      kind: 'fast',
      token: 'tok',
      user: { friendCode: '111111111111111' },
    }));
    await expect(loginByQr({ kind: 'text', qrCode: ' SGWCMAID123 ' })).resolves.toEqual({
      kind: 'fast',
      token: 'tok',
      friendCode: '111111111111111',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/auth/qr-login'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ qrCode: 'SGWCMAID123' }),
      }),
    );
  });

  it('慢路径轮询至 matched', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(201, { kind: 'async', attemptId: 'a1' }))
      .mockResolvedValueOnce(jsonResponse(200, { status: 'pending' }))
      .mockResolvedValueOnce(jsonResponse(200, {
        status: 'matched',
        token: 'tok-slow',
        user: { friendCode: '222222222222222' },
      }));

    const onProgress = vi.fn();
    const done = loginByQrUntilToken({
      credential: { kind: 'text', qrCode: 'SGWCMAID' },
      onProgress,
    });

    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1_000);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(done).resolves.toEqual({
      token: 'tok-slow',
      friendCode: '222222222222222',
    });
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      message: '正在准备登录…',
    }));
  });

  it('轮询 failed 时抛错', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {
      status: 'failed',
      error: '匹配到多个候选，请改用好友码',
    }));
    const done = pollQrLoginUntilToken({ attemptId: 'bad' });
    const expectation = expect(done).rejects.toThrow(/好友码/);
    await vi.advanceTimersByTimeAsync(0);
    await expectation;
  });
});
