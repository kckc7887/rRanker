import { describe, expect, it, vi } from 'vitest';
import { AbortController as NativeAbortController } from 'abort-controller';
import { fetchMe } from '@/services/score-hub-client';
import { createAccountProbeFetch, ACCOUNT_PROBE_ORIGIN } from './native/expo-fetch-adapter';
import type { fetch as nativeFetch } from 'expo/fetch';

function response(url: string, redirected = false) {
  const result = new Response('{"success":true}', { headers: { 'Content-Type': 'application/json' } });
  Object.defineProperties(result, { url: { value: url }, redirected: { value: redirected } });
  return result;
}

describe('native account probe transport isolation', () => {
  it('authenticates ScoreHub through the real request path with the React Native AbortSignal', async () => {
    const profile = { friendCode: '123456789012345', hasCabinetUserId: true };
    const result = new Response(JSON.stringify(profile));
    Object.defineProperty(result, 'url', { value: `${ACCOUNT_PROBE_ORIGIN}/scorehub/me` });
    const transport = vi.fn().mockResolvedValue(result);
    vi.stubGlobal('AbortController', NativeAbortController);
    vi.stubGlobal('fetch', createAccountProbeFetch(transport as typeof nativeFetch));
    try {
      await expect(fetchMe('restored-token')).resolves.toEqual(profile);
      expect(transport).toHaveBeenCalledOnce();
      expect(transport).toHaveBeenCalledWith(`${ACCOUNT_PROBE_ORIGIN}/scorehub/me`, expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer restored-token' }),
        credentials: 'omit', redirect: 'error',
      }));
    } finally { vi.unstubAllGlobals(); }
  });

  it('keeps native body, authentication and cancellation while projecting the official response origin', async () => {
    const actual = response(`${ACCOUNT_PROBE_ORIGIN}/lxns/player`);
    const transport = vi.fn().mockResolvedValue(actual);
    const fetcher = createAccountProbeFetch(transport as typeof nativeFetch);
    const signal = new AbortController().signal;
    const headers = { Authorization: 'Bearer probe-token' };
    const result = await fetcher('https://maimai.lxns.net/api/v0/user/maimai/player', { headers, signal });
    expect(transport).toHaveBeenCalledWith(`${ACCOUNT_PROBE_ORIGIN}/lxns/player`, {
      headers, signal, credentials: 'omit', redirect: 'error',
    });
    expect(result.url).toBe('https://maimai.lxns.net/api/v0/user/maimai/player');
    expect(result.body).toBe(actual.body);
    expect(result.headers).toBe(actual.headers);
    expect(await result.json()).toEqual({ success: true });
  });

  it.each([
    'https://maimai.lxns.net.evil/api/v0/user/maimai/player',
    'https://maimai.lxns.net/api/v0/user/maimai/player?unexpected=true',
    'https://maimai.lxns.net/api/v0/oauth/token',
    `${ACCOUNT_PROBE_ORIGIN}/fixture?run=${'a'.repeat(32)}&run=${'a'.repeat(32)}`,
    `${ACCOUNT_PROBE_ORIGIN}/other`,
  ])('rejects unregistered destination %s before native IO', async url => {
    const transport = vi.fn();
    await expect(createAccountProbeFetch(transport as typeof nativeFetch)(url)).rejects.toThrow('destination');
    expect(transport).not.toHaveBeenCalled();
  });

  it.each([['https://other.test/', false], [`${ACCOUNT_PROBE_ORIGIN}/lxns/player`, true]])(
    'rejects foreign or redirected native responses', async (url, redirected) => {
      const transport = vi.fn().mockResolvedValue(response(url, redirected));
      await expect(createAccountProbeFetch(transport as typeof nativeFetch)(
        'https://maimai.lxns.net/api/v0/user/maimai/player',
      )).rejects.toThrow('response origin');
    },
  );
});
