import { createCipheriv } from 'node:crypto';
import { gcm } from '@noble/ciphers/aes.js';
import { describe, expect, it, vi } from 'vitest';
import { decryptRizlineSave, isRizlineNeedsSmsError, isRizlineTokenExpired, RizlineProvider, RizlineSaveSchema } from '@/providers/rizline-provider';
import { ProviderError } from '@/providers/errors';
import type { RizlineSession } from '@/providers/contracts';
import { base64ToBytes, bytesToBase64 } from '@/utils/crypto-subset';

const phone = '13800000000';
const save = { userId: 'fixture-user', username: '测试玩家', totalRks: 135.4321,
  myBest: [{ trackAssetId: 'track.fixture.0', difficultyClassName: 'IN', score: 1010000, completeRate: 120, isFullCombo: true }],
  levelsRks: [{ trackId: 'fixture.0', difficultyClassName: 'IN', rks: 140.5 }] };
function token(extra = {}) {
  return `e30.${Buffer.from(JSON.stringify({ userId: save.userId, phone, gameId: 'pigeongames.rizline', channelId: '1', ...extra })).toString('base64url')}.signature`;
}
const session: RizlineSession = { mode: 'rizline', phone, token: token(), deviceId: 'fixture-device', channelId: '1', persistable: true };
function encrypt(value: unknown): Uint8Array {
  // Node/OpenSSL is independent of the production noble implementation and packed-key expansion.
  const key = Buffer.from('5866617b714f2e397354477076346963533a405d5848456a727a5567715d7c51', 'hex');
  const nonce = Buffer.from('00112233445566778899aabb', 'hex');
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const bytes = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return new Uint8Array(Buffer.concat([nonce, bytes, cipher.getAuthTag()]));
}
const binaryResponse = (body: Uint8Array, headers?: HeadersInit) => new Response(new Uint8Array(body), { headers });
const jsonResponse = (value: unknown, headers?: HeadersInit) => new Response(JSON.stringify(value), { headers });

describe('Rizline authenticated save decoding', () => {
  it('matches the published NIST AES-256-GCM example 2 ciphertext and 128-bit tag', () => {
    // NIST GCM-AES256 example 2, pages 22–23 (96-bit IV; no AAD).
    // https://csrc.nist.gov/CSRC/media/Projects/Cryptographic-Standards-and-Guidelines/documents/examples/AES_GCM.pdf
    const key = Buffer.from('feffe9928665731c6d6a8f9467308308feffe9928665731c6d6a8f9467308308', 'hex');
    const nonce = Buffer.from('cafebabefacedbaddecaf888', 'hex');
    const plaintext = Buffer.from('d9313225f88406e5a55909c5aff5269a86a7a9531534f7da2e4c303d8a318a721c3c0c95956809532fcf0e2449a6b525b16aedf5aa0de657ba637b391aafd255', 'hex');
    const ciphertextAndTag = Buffer.from('522dc1f099567d07f47f37a32a84427d643a8cdcbfe5c0c97598a2bd2555d1aa8cb08e48590dbb3da7b08b1056828838c5f61e6393ba7a0abcc9f662898015adb094dac5d93471bdec1a502270e3cc6c', 'hex');
    expect(Buffer.from(gcm(key, nonce).encrypt(plaintext))).toEqual(ciphertextAndTag);
    expect(Buffer.from(gcm(key, nonce).decrypt(ciphertextAndTag))).toEqual(plaintext);
  });
  it('decrypts a standards implementation fixture and strips unrelated private save fields', () => {
    const bytes = encrypt({ ...save, coin: 123, unrelatedSecret: 'not-retained' });
    expect(decryptRizlineSave(bytes)).toEqual(save);
    expect(decryptRizlineSave(new TextEncoder().encode(bytesToBase64(bytes)))).toEqual(save);
  });
  it('rejects changed tags, changed ciphertext, truncation and invalid decoded structure', () => {
    const changedTag = encrypt(save); changedTag[changedTag.length - 1] ^= 1;
    const changedBody = encrypt(save); changedBody[15] ^= 1;
    for (const bytes of [changedTag, changedBody, new Uint8Array(27), encrypt({ code: 0, data: save }), encrypt({ ...save, myBest: null })]) {
      expect(() => decryptRizlineSave(bytes)).toThrow(ProviderError);
    }
  });
  it('preserves empty player saves and special difficulty scores, while rejecting invalid numbers', () => {
    expect(RizlineSaveSchema.parse({ ...save, myBest: [], levelsRks: [] }).myBest).toEqual([]);
    expect(RizlineSaveSchema.parse({ ...save, myBest: [{ ...save.myBest[0], difficultyClassName: 'SP' }] }).myBest[0].difficultyClassName).toBe('SP');
    expect(RizlineSaveSchema.safeParse({ ...save, totalRks: NaN }).success).toBe(false);
    expect(() => base64ToBytes('not base64!')).toThrow();
  });
});

describe('Rizline official SMS and account requests', () => {
  it('sends exactly one SMS request, uses a stable device and reports unconfirmed empty bodies', async () => {
    const fetcher = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>().mockResolvedValueOnce(jsonResponse({ code: 0 }, { 'Retry-After': '90' })).mockResolvedValueOnce(new Response(''));
    const provider = new RizlineProvider({ fetcher });
    expect(await provider.sendVerificationCode(phone)).toEqual({ retryAfterSeconds: 90, confirmed: true });
    expect(await provider.sendVerificationCode(phone)).toEqual({ retryAfterSeconds: 60, confirmed: false });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][0]).toBe('https://rizserver.pigeongames.net/account/send_verify_code');
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({ phone, transaction: 'login' });
    const first = new Headers(fetcher.mock.calls[0][1]?.headers), second = new Headers(fetcher.mock.calls[1][1]?.headers);
    expect(first.get('device_id')).toBe(second.get('device_id'));
    expect(first.get('phone')).toBe(phone);
    expect(first.get('token')).toBeNull();
  });
  it('honors long rate limits without automatically repeating the SMS side effect', async () => {
    const fetcher = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>().mockResolvedValue(new Response('Too Many Requests', { status: 429, headers: { 'Retry-After': '180' } }));
    await expect(new RizlineProvider({ fetcher }).sendVerificationCode(phone)).rejects.toMatchObject({ code: 'rate_limit', retryAfterSeconds: 180 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('retains server cooldowns when a successful HTTP response reports a failed or unreadable SMS result', async () => {
    const fetcher = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(jsonResponse({ code: 1 }, { 'Retry-After': '180' }))
      .mockResolvedValueOnce(new Response('Unreadable', { headers: { 'Retry-After': '240' } }));
    const provider = new RizlineProvider({ fetcher });
    await expect(provider.sendVerificationCode(phone)).rejects.toMatchObject({ retryAfterSeconds: 180 });
    await expect(provider.sendVerificationCode(phone)).rejects.toMatchObject({ retryAfterSeconds: 240 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('validates code and account before returning credentials and omits transient inputs', async () => {
    const fetcher = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>().mockResolvedValueOnce(jsonResponse({ code: 0 }, { set_token: token() })).mockResolvedValueOnce(binaryResponse(encrypt(save)));
    const result = await new RizlineProvider({ fetcher }).login(phone, '123456');
    expect(result.player).toEqual({ userId: save.userId, username: save.username, totalRks: save.totalRks });
    expect(JSON.stringify(result.session)).not.toContain('123456');
    expect(result.session).toMatchObject({ mode: 'rizline', phone, token: token(), persistable: true });
    expect(fetcher.mock.calls.map(call => call[0])).toEqual([
      'https://rizserver.pigeongames.net/account/login', 'https://rizserver.pigeongames.net/game/rn_login',
    ]);
    const headers = new Headers(fetcher.mock.calls[1][1]?.headers);
    expect(headers.get('token')).toBe(token());
    expect(headers.get('game_id')).toBe('pigeongames.rizline');
    expect(headers.get('phone')).toBe(phone);
    expect(headers.get('Accept')).toBe('*/*');
    expect(headers.get('User-Agent')).toBe('UnityPlayer/2022.3.62f2 (UnityWebRequest/1.0, libcurl/8.10.1-DEV)');
    expect(headers.get('X-Unity-Version')).toBe('2022.3.62f2');
  });
  it('logs in with a password after check_phone allows it and omits the password from the session', async () => {
    const password = 'secret-password';
    const fetcher = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(jsonResponse({ code: 0 }))
      .mockResolvedValueOnce(jsonResponse({ code: 0 }, { token: token() }))
      .mockResolvedValueOnce(binaryResponse(encrypt(save)));
    const result = await new RizlineProvider({ fetcher }).loginWithPassword(phone, password);
    expect(result.player.userId).toBe(save.userId);
    expect(JSON.stringify(result.session)).not.toContain(password);
    expect(fetcher.mock.calls.map(call => String(call[0]))).toEqual([
      'https://rizserver.pigeongames.net/account/check_phone',
      'https://rizserver.pigeongames.net/account/login',
      'https://rizserver.pigeongames.net/game/rn_login',
    ]);
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual({ phone, password });
  });
  it('requires SMS when check_phone forbids password login and does not send a code', async () => {
    const fetcher = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>().mockResolvedValueOnce(jsonResponse({ code: 1 }));
    const error = await new RizlineProvider({ fetcher }).loginWithPassword(phone, 'secret').catch(value => value);
    expect(isRizlineNeedsSmsError(error)).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toContain('/account/check_phone');
  });
  it('requires SMS when password login returns code 3', async () => {
    const fetcher = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(jsonResponse({ code: 0 }))
      .mockResolvedValueOnce(jsonResponse({ code: 3 }));
    const error = await new RizlineProvider({ fetcher }).loginWithPassword(phone, 'secret').catch(value => value);
    expect(isRizlineNeedsSmsError(error)).toBe(true);
    expect(fetcher.mock.calls.map(call => String(call[0]))).toEqual([
      'https://rizserver.pigeongames.net/account/check_phone',
      'https://rizserver.pigeongames.net/account/login',
    ]);
  });
  it('rotates credentials from set_token, set-token or token response headers', async () => {
    const nextToken = token({ exp: 9999999999 });
    for (const header of ['set_token', 'set-token', 'token'] as const) {
      const onSessionChanged = vi.fn(async () => undefined);
      const fetcher = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
        .mockResolvedValue(binaryResponse(encrypt(save), { [header]: nextToken }));
      await expect(new RizlineProvider({ fetcher, session, onSessionChanged }).getSave()).resolves.toEqual(save);
      expect(onSessionChanged).toHaveBeenCalledWith({ ...session, token: nextToken });
    }
  });
  it('does not treat rn_login HTTP 400 as an expired login', async () => {
    const fetcher = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValue(new Response('bad request', { status: 400 }));
    await expect(new RizlineProvider({ fetcher, session }).getSave()).rejects.toMatchObject({ code: 'unknown' });
  });
  it('preempts rn_login when the JWT is expired or within the 60s skew', async () => {
    const fetcher = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
    const expired = { ...session, token: token({ exp: Math.floor(Date.now() / 1000) - 1 }) };
    await expect(new RizlineProvider({ fetcher, session: expired }).getSave()).rejects.toMatchObject({ code: 'authentication' });
    expect(fetcher).not.toHaveBeenCalled();
    expect(isRizlineTokenExpired(expired.token)).toBe(true);
    const skewed = { ...session, token: token({ exp: Math.floor(Date.now() / 1000) + 30 }) };
    await expect(new RizlineProvider({ fetcher, session: skewed }).getSave()).rejects.toMatchObject({ code: 'authentication' });
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockResolvedValue(binaryResponse(encrypt(save)));
    await expect(new RizlineProvider({ fetcher, session: expired, allowExpiredToken: true }).getSave()).resolves.toEqual(save);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('fills a missing phone header from the JWT claims', async () => {
    const fetcher = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValue(binaryResponse(encrypt(save)));
    await new RizlineProvider({ fetcher, session: { ...session, phone: '' } }).getSave();
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('phone')).toBe(phone);
  });
  it('rejects invalid input, failed login, missing credential and another account save', async () => {
    const fetcher = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
    const provider = new RizlineProvider({ fetcher });
    await expect(provider.sendVerificationCode('not-a-phone')).rejects.toMatchObject({ code: 'authentication' });
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockResolvedValueOnce(jsonResponse({ code: 3 }));
    await expect(provider.login(phone, '123456')).rejects.toMatchObject({ code: 'authentication' });
    fetcher.mockResolvedValueOnce(jsonResponse({ code: 0 }));
    await expect(provider.login(phone, '123456')).rejects.toMatchObject({ code: 'authentication' });
    fetcher.mockResolvedValueOnce(binaryResponse(encrypt({ ...save, userId: 'another-user' })));
    await expect(new RizlineProvider({ fetcher, session }).getSave()).rejects.toMatchObject({ code: 'authentication' });
  });
  it('does not publish data until rotated credentials are persisted', async () => {
    const nextToken = token({ exp: 9999999999 });
    const onSessionChanged = vi.fn(async () => { throw new Error('disk unavailable'); });
    const fetcher = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>().mockResolvedValue(binaryResponse(encrypt(save), { set_token: nextToken }));
    await expect(new RizlineProvider({ fetcher, session, onSessionChanged }).getSave()).rejects.toThrow('disk unavailable');
    expect(onSessionChanged).toHaveBeenCalledWith({ ...session, token: nextToken });
  });
  it('rejects a rotated credential for a different account and expired HTTP responses', async () => {
    const onSessionChanged = vi.fn(async () => undefined);
    const fetcher = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>().mockResolvedValueOnce(binaryResponse(encrypt(save), { set_token: token({ userId: 'another-user' }) }))
      .mockResolvedValueOnce(new Response('Expired', { status: 401 }));
    const provider = new RizlineProvider({ fetcher, session, onSessionChanged });
    await expect(provider.getSave()).rejects.toMatchObject({ code: 'authentication' });
    expect(onSessionChanged).not.toHaveBeenCalled();
    await expect(provider.getSave()).rejects.toMatchObject({ code: 'authentication' });
  });
  it('cancels before exposing a late save or rotating credentials', async () => {
    const controller = new AbortController();
    const onSessionChanged = vi.fn(async () => undefined);
    const fetcher = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>().mockImplementation(async () => {
      controller.abort(new Error('cancelled'));
      return binaryResponse(encrypt(save), { set_token: token({ exp: 1 }) });
    });
    await expect(new RizlineProvider({ fetcher, session, onSessionChanged }).getSave(controller.signal)).rejects.toThrow('cancelled');
    expect(onSessionChanged).not.toHaveBeenCalled();
  });
});
