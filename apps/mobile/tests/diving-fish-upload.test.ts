import { AbortController as NativeAbortController } from 'abort-controller';
import { uploadRecordsToDivingFish } from '@/services/diving-fish-upload';

const record = { title: 'Test', type: 'DX' as const, level_index: 3, achievements: 100.5, dxScore: 1900, fc: 'app', fs: 'fsdp' };
const remote = { title: 'Test', song_id: 123, type: 'DX', level_index: 3, achievements: 100.5, dxScore: 1900, fc: 'app', fs: 'fsdp', level: '14', ds: 14, ra: 315, rate: 'sssp' };

describe.each([['Node', globalThis.AbortController], ['React Native', NativeAbortController]] as const)('水鱼写入确认: %s', (_runtime, Controller) => {
  beforeEach(() => vi.stubGlobal('AbortController', Controller));
  it('已收到成功状态但正文超限时只核验，不将异常当作可重传失败', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('', { status: 200, headers: { 'content-length': String(128 * 1024 * 1024) } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ records: [] })));
    vi.stubGlobal('fetch', fetcher);
    await expect(uploadRecordsToDivingFish('token', [record])).resolves.toMatchObject({ status: 'unconfirmed', uploaded: 0 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  afterEach(() => vi.unstubAllGlobals());
  it.each([[], [{ ...remote, achievements: 99 }], [remote, { ...remote, song_id: 456 }]].map(records => ({ records })))('HTML 500 不确认缺失、不同或歧义成绩', async ({ records }) => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('<!DOCTYPE html>failed', { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ records })));
    vi.stubGlobal('fetch', fetcher);
    await expect(uploadRecordsToDivingFish('token', [record])).resolves.toMatchObject({ status: 'unconfirmed', uploaded: 0 });
    expect(fetcher.mock.calls.map(call => call[1]?.method ?? 'GET')).toEqual(['POST', 'GET']);
  });
  it('写入响应丢失后只读核对完整成绩，不重发写请求', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new TypeError('connection reset'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ records: [remote] })));
    vi.stubGlobal('fetch', fetcher);
    await expect(uploadRecordsToDivingFish('token', [record])).resolves.toMatchObject({ status: 'success', uploaded: 1 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('验证失败时保留未确认状态', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('failed', { status: 500 })).mockRejectedValueOnce(new TypeError('offline'));
    vi.stubGlobal('fetch', fetcher);
    await expect(uploadRecordsToDivingFish('token', [record])).resolves.toMatchObject({ status: 'unconfirmed', uploaded: 0 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
