import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { fetch as expoFetch } from 'expo/fetch';
import { z } from 'zod';
import type { ProviderSession } from './contracts';
import { ProviderError } from './errors';
import {
  LXNS_OAUTH_AUTHORIZE_URL,
  LXNS_OAUTH_CLIENT_ID,
  LXNS_OAUTH_REDIRECT_URI,
  LXNS_OAUTH_SCOPE,
  LXNS_OAUTH_TOKEN_URL,
  LXNS_TOKEN_REFRESH_SKEW_SECONDS,
} from './lxns-config';

const PENDING_VERIFIER_KEY = 'rranker.lxns.oauth.pending.v1';

const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  expires_in: z.number().finite().positive(),
  refresh_token: z.string().min(1),
  scope: z.string().optional(),
}).passthrough();

const OAuthErrorSchema = z.object({
  error: z.string(),
  error_description: z.string().optional(),
}).passthrough();

export type LxnsOAuthSession = Extract<ProviderSession, { mode: 'lxns-oauth' }>;

function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = typeof btoa === 'function'
    ? btoa(binary)
    : Buffer.from(bytes).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function createPkcePair(): Promise<{ verifier: string; challenge: string }> {
  const bytes = await Crypto.getRandomBytesAsync(32);
  const verifier = base64UrlFromBytes(bytes);
  const challenge = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
    { encoding: Crypto.CryptoEncoding.BASE64 },
  );
  const challengeUrl = challenge.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return { verifier, challenge: challengeUrl };
}

export function buildAuthorizeUrl(codeChallenge: string, state?: string): string {
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: LXNS_OAUTH_CLIENT_ID,
    redirect_uri: LXNS_OAUTH_REDIRECT_URI,
    scope: LXNS_OAUTH_SCOPE,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  if (state) query.set('state', state);
  return `${LXNS_OAUTH_AUTHORIZE_URL}?${query.toString()}`;
}

export async function beginLxnsAuthorize(): Promise<string> {
  const { verifier, challenge } = await createPkcePair();
  await SecureStore.setItemAsync(PENDING_VERIFIER_KEY, verifier, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return buildAuthorizeUrl(challenge);
}

export async function clearPendingLxnsVerifier(): Promise<void> {
  await SecureStore.deleteItemAsync(PENDING_VERIFIER_KEY);
}

function parseTokenPayload(payload: unknown): z.infer<typeof TokenResponseSchema> {
  if (payload && typeof payload === 'object' && 'access_token' in payload) {
    const top = TokenResponseSchema.safeParse(payload);
    if (top.success) return top.data;
  }
  if (payload && typeof payload === 'object' && 'data' in payload) {
    const nested = TokenResponseSchema.safeParse((payload as { data: unknown }).data);
    if (nested.success) return nested.data;
  }
  throw new ProviderError('upstream_schema', '落雪 OAuth token 响应与已验证契约不一致', true);
}

function toSession(token: z.infer<typeof TokenResponseSchema>): LxnsOAuthSession {
  return {
    mode: 'lxns-oauth',
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: Date.now() + token.expires_in * 1000,
    persistable: true,
  };
}

async function postToken(body: Record<string, string>): Promise<LxnsOAuthSession> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await expoFetch(LXNS_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const err = OAuthErrorSchema.safeParse(payload);
      const description = err.success
        ? (err.data.error_description ?? err.data.error)
        : `HTTP ${response.status}`;
      throw new ProviderError(
        response.status === 400 || response.status === 401 ? 'authentication' : 'network',
        `落雪授权失败：${description}`,
        response.status >= 500,
      );
    }
    return toSession(parseTokenPayload(payload));
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ProviderError('timeout', '落雪 OAuth 超时', true, { cause: error });
    }
    throw new ProviderError('network', '无法连接落雪 OAuth', true, { cause: error });
  } finally {
    clearTimeout(timeout);
  }
}

export async function exchangeLxnsAuthorizationCode(code: string): Promise<LxnsOAuthSession> {
  const trimmed = code.trim();
  if (!trimmed) throw new ProviderError('authentication', '请输入落雪授权码', false);
  const verifier = await SecureStore.getItemAsync(PENDING_VERIFIER_KEY);
  if (!verifier) {
    throw new ProviderError('authentication', '找不到本机 PKCE 验证信息，请重新打开授权页', false);
  }
  try {
    const session = await postToken({
      grant_type: 'authorization_code',
      code: trimmed,
      client_id: LXNS_OAUTH_CLIENT_ID,
      redirect_uri: LXNS_OAUTH_REDIRECT_URI,
      code_verifier: verifier,
    });
    await clearPendingLxnsVerifier();
    return session;
  } catch (error) {
    throw error;
  }
}

export async function refreshLxnsAccessToken(refreshToken: string): Promise<LxnsOAuthSession> {
  return postToken({
    grant_type: 'refresh_token',
    client_id: LXNS_OAUTH_CLIENT_ID,
    refresh_token: refreshToken,
  });
}

export function lxnsAccessTokenExpired(session: LxnsOAuthSession, now = Date.now()): boolean {
  return session.expiresAt <= now + LXNS_TOKEN_REFRESH_SKEW_SECONDS * 1000;
}
