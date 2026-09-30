import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadSave, exchangeSessionToken, getGameSave, getPlayerId, pickLatestGameSave, requestDeviceCode } from '@/providers/phigros-auth';
import { Base64, HmacSHA1, MD5 } from '@/utils/crypto-subset';

vi.mock('expo/fetch', () => ({ fetch: (...args: Parameters<typeof fetch>) => fetch(...args) }));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('pickLatestGameSave', () => {
  it('picks the save with the latest updatedAt', () => {
    const picked = pickLatestGameSave([
      {
        summary: 'old',
        gameFile: { url: 'https://example.com/old.save' },
        updatedAt: '2025-04-12T08:58:24.635Z',
      },
      {
        summary: 'new',
        gameFile: { url: 'https://example.com/new.save' },
        updatedAt: '2026-07-20T08:00:00.000Z',
      },
    ]);
    expect(picked.summaryBase64).toBe('new');
    expect(picked.saveUrl).toContain('new.save');
    expect(picked.updatedAt).toBe('2026-07-20T08:00:00.000Z');
  });

  it('ignores entries without gameFile url', () => {
    const picked = pickLatestGameSave([
      {
        summary: 'broken',
        gameFile: { url: '' },
        updatedAt: '2099-01-01T00:00:00.000Z',
      },
      {
        summary: 'ok',
        gameFile: { url: 'https://example.com/ok.save' },
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    expect(picked.summaryBase64).toBe('ok');
  });

  it('throws when no valid saves exist', () => {
    expect(() => pickLatestGameSave([])).toThrow('云存档列表为空');
  });
});

describe('shared Phigros transport', () => {
  it('preserves device-code form fields and a single attempt', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ success: true, data: {
      device_code: 'code', qrcode_url: 'https://accounts.tapapis.cn/qr', expires_in: 300,
    } }));
    vi.stubGlobal('fetch', fetcher);
    const result = await requestDeviceCode();
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://accounts.tapapis.cn/oauth2/v1/device/code');
    const form = new URLSearchParams(init.body as string);
    expect(Object.fromEntries(form)).toMatchObject({ response_type: 'device_code', scope: 'public_profile', platform: 'unity' });
    expect(JSON.parse(form.get('info')!)).toEqual({ device_id: result.deviceId });
    expect(result.interval).toBe(5); expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('preserves MAC profile signing and the LeanCloud session-exchange payload', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-30T01:00:00Z'));
    const fetcher = vi.fn().mockResolvedValueOnce(jsonResponse({ data: { openid: 'open', name: 'player', avatar: 'https://avatar.test/icon' } }))
      .mockResolvedValueOnce(jsonResponse({ sessionToken: 'session' }));
    vi.stubGlobal('fetch', fetcher);
    await expect(exchangeSessionToken({ kid: 'key', access_token: 'access', mac_key: 'mac' })).resolves.toEqual({ sessionToken: 'session', playerId: 'player' });
    const [profileUrl, profileInit] = fetcher.mock.calls[0] as [string, RequestInit];
    const authorization = new Headers(profileInit.headers).get('Authorization')!;
    const match = authorization.match(/^MAC id="key", ts="(\d+)", nonce="([a-zA-Z0-9]+)", mac="([^"]+)"$/)!;
    const profile = new URL(profileUrl);
    const signature = Base64.stringify(HmacSHA1(`${match[1]}\n${match[2]}\nGET\n${profile.pathname}${profile.search}\n${profile.hostname}\n443\n\n`, 'mac'));
    expect(match[3]).toBe(signature);
    const [, init] = fetcher.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ authData: { taptap: {
      openid: 'open', name: 'player', avatar: 'https://avatar.test/icon', kid: 'key', access_token: 'access', mac_key: 'mac', expires_in: 0, platform: 'TapTap',
    } } });
    const headers = new Headers(init.headers); const at = String(Math.floor(Date.now() / 1000));
    expect(headers.get('X-LC-Sign')).toBe(`${MD5(at + 'Qr9AEqtuoSVS3zeD6iVbM4ZC0AtkJcQ89tywVyi0').toString()},${at}`);
    expect(init).toMatchObject({ method: 'POST', credentials: 'omit', redirect: 'error' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('preserves LeanCloud session headers and ordered latest-save selection', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(jsonResponse({ nickname: 'name' })).mockResolvedValueOnce(jsonResponse({ results: [
      { summary: 'old', gameFile: { url: 'https://cdn.test/old' }, updatedAt: '2026-01-01' },
      { summary: 'new', gameFile: { url: 'https://cdn.test/new' }, updatedAt: '2026-09-30' },
    ] }));
    vi.stubGlobal('fetch', fetcher);
    expect(await getPlayerId('session')).toBe('name');
    expect(await getGameSave('session')).toEqual({ summaryBase64: 'new', saveUrl: 'https://cdn.test/new', updatedAt: '2026-09-30' });
    const [url, init] = fetcher.mock.calls[1] as [string, RequestInit];
    expect(new URL(url).searchParams.get('order')).toBe('-updatedAt');
    expect(new URL(url).searchParams.get('limit')).toBe('20');
    expect(new Headers(init.headers).get('X-LC-Session')).toBe('session');
  });

  it('does not parse HTTP failure envelopes or repeat credential requests', async () => {
    const fetcher = vi.fn(async () => new Response('<html>502</html>', { status: 502 }));
    vi.stubGlobal('fetch', fetcher);
    await expect(getPlayerId('session')).rejects.toMatchObject({ code: 'network', retryable: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('preserves binary bytes and cache busting without adding the JSON size limit', async () => {
    const bytes = Uint8Array.from([0, 255, 128, 10]);
    const fetcher = vi.fn(async () => new Response(bytes, { headers: { 'Content-Length': String(65 * 1024 * 1024) } }));
    vi.stubGlobal('fetch', fetcher);
    expect(new Uint8Array(await downloadSave('https://cdn.test/save?version=1', 'revision'))).toEqual(bytes);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).searchParams.get('_ts')).toBe('revision');
    expect(new URL(url).searchParams.get('version')).toBe('1');
    expect(init.redirect).toBeUndefined(); expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('cancels body reading promptly and never starts a request already cancelled', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    const fetcher = vi.fn(async () => new Response(body));
    vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();
    const load = downloadSave('https://cdn.test/save', 'revision', controller.signal);
    await vi.waitFor(() => expect(body.locked).toBe(true));
    controller.abort(new Error('cancelled'));
    await expect(load).rejects.toThrow('cancelled');
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
    await expect(getPlayerId('session', controller.signal)).rejects.toThrow('cancelled');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
