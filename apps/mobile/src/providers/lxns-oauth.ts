import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { fetch as expoFetch } from 'expo/fetch';
import { z } from 'zod';
import type { ProviderSession } from './contracts';
import { ProviderError, runProviderOperation } from './errors';
import { requestProviderResponse } from './http-json';
import {
  LXNS_OAUTH_AUTHORIZE_URL,
  LXNS_OAUTH_CLIENT_ID,
  LXNS_OAUTH_REDIRECT_URI,
  LXNS_OAUTH_SCOPE,
  LXNS_OAUTH_TOKEN_URL,
  LXNS_TOKEN_REFRESH_SKEW_SECONDS,
} from './lxns-config';

const PENDING_OAUTH_KEY = 'rranker.lxns.oauth.pending.v2';
const PENDING_OAUTH_TTL_MS = 10 * 60 * 1000;
let pendingMutation: Promise<unknown> = Promise.resolve();
function withPendingMutation<T>(action: () => Promise<T>): Promise<T> {
  const result = pendingMutation.then(action, action);
  pendingMutation = result.catch(() => undefined);
  return result;
}

export type PendingLxnsOAuth = {
  verifier: string;
  state: string;
  gameId: 'maimai' | 'chunithm';
  expiresAt: number;
};

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

async function createStateValue(): Promise<string> {
  return base64UrlFromBytes(await Crypto.getRandomBytesAsync(16));
}

export function buildAuthorizeUrl(codeChallenge: string, state: string): string {
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: LXNS_OAUTH_CLIENT_ID,
    redirect_uri: LXNS_OAUTH_REDIRECT_URI,
    scope: LXNS_OAUTH_SCOPE,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  query.set('state', requireLxnsOAuthState(state));
  return `${LXNS_OAUTH_AUTHORIZE_URL}?${query.toString()}`;
}

export async function beginLxnsAuthorize(input: {
  gameId: 'maimai' | 'chunithm';
}): Promise<string> {
  const { verifier, challenge } = await createPkcePair();
  const state = await createStateValue();
  const pending: PendingLxnsOAuth = { verifier, state, gameId: input.gameId, expiresAt: Date.now() + PENDING_OAUTH_TTL_MS };
  await withPendingMutation(() => SecureStore.setItemAsync(PENDING_OAUTH_KEY, JSON.stringify(pending), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  }));
  return buildAuthorizeUrl(challenge, state);
}

export async function readPendingLxnsOAuth(): Promise<PendingLxnsOAuth | null> {
  return withPendingMutation(loadPendingLxnsOAuth);
}

async function loadPendingLxnsOAuth(): Promise<PendingLxnsOAuth | null> {
  const raw = await runProviderOperation('credential_storage', () => SecureStore.getItemAsync(PENDING_OAUTH_KEY));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingLxnsOAuth>;
    if (typeof parsed.verifier !== 'string' || !parsed.verifier.trim()
      || typeof parsed.state !== 'string' || !parsed.state.trim()
      || typeof parsed.expiresAt !== 'number' || !Number.isFinite(parsed.expiresAt)
      || (parsed.gameId !== 'maimai' && parsed.gameId !== 'chunithm')) {
      return null;
    }
    return parsed as PendingLxnsOAuth;
  } catch {
    return null;
  }
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

async function postToken(body: Record<string, string>, signal?: AbortSignal): Promise<LxnsOAuthSession> {
  return requestProviderResponse({
    baseUrl: LXNS_OAUTH_TOKEN_URL, path: '', schema: TokenResponseSchema,
    fetcher: expoFetch as unknown as typeof fetch, label: '落雪 OAuth',
    totalAttempts: 1, signal, authenticated: true, maxResponseBytes: 256 * 1024,
    error: status => new ProviderError(status === 400 || status === 401 ? 'authentication' : 'network', '落雪授权失败，请重新发起授权', status >= 500),
    onHttpError: async response => {
      let payload: unknown = null;
      try { payload = await response.json(); } catch (error) { if (!(error instanceof SyntaxError)) throw error; }
      const parsed = OAuthErrorSchema.safeParse(payload);
      const authentication = response.status === 400 || response.status === 401 || (parsed.success && parsed.data.error === 'invalid_grant');
      return new ProviderError(authentication ? 'authentication' : 'network', '落雪授权失败，请重新发起授权', response.status >= 500);
    },
    messages: { schema: '落雪 OAuth token 响应与已验证契约不一致', timeout: '落雪 OAuth 超时', network: '无法连接落雪 OAuth' },
    init: {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  }, async response => parseTokenPayload(await response.json())).then(toSession);
}

export function requireLxnsOAuthState(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) {
    throw new ProviderError('authorization_callback', '授权状态校验失败，请重新发起授权', false);
  }
  return value;
}

export async function exchangeLxnsAuthorizationCode(
  code: string,
  expectState: unknown,
  signal?: AbortSignal,
): Promise<LxnsOAuthSession> {
  const trimmed = code.trim();
  if (!trimmed) throw new ProviderError('authentication', '缺少落雪授权码', false);
  const state = requireLxnsOAuthState(expectState);
  const pending = await withPendingMutation(async () => {
    if (signal?.aborted) throw signal.reason;
    const pending = await loadPendingLxnsOAuth();
    if (!pending) throw new ProviderError('authorization_callback', '找不到本机 PKCE 验证信息，请重新打开授权页', false);
    if (pending.expiresAt <= Date.now()) {
      await runProviderOperation('credential_storage', () => SecureStore.deleteItemAsync(PENDING_OAUTH_KEY));
      throw new ProviderError('authorization_callback', '授权已过期，请重新发起授权', false);
    }
    if (pending.state !== state) throw new ProviderError('authorization_callback', '授权状态校验失败，请重新发起授权', false);
    /** 换码失败也需重新授权，迟到回调不能删除新授权。 */
    await runProviderOperation('credential_storage', () => SecureStore.deleteItemAsync(PENDING_OAUTH_KEY));
    return pending;
  });
  return exchangeWithVerifier(trimmed, pending.verifier, signal);
}

async function exchangeWithVerifier(code: string, verifier: string, signal?: AbortSignal): Promise<LxnsOAuthSession> {
  const session = await postToken({
    grant_type: 'authorization_code',
    code,
    client_id: LXNS_OAUTH_CLIENT_ID,
    redirect_uri: LXNS_OAUTH_REDIRECT_URI,
    code_verifier: verifier,
  }, signal);
  return session;
}

export async function refreshLxnsAccessToken(refreshToken: string, signal?: AbortSignal): Promise<LxnsOAuthSession> {
  return postToken({
    grant_type: 'refresh_token',
    client_id: LXNS_OAUTH_CLIENT_ID,
    refresh_token: refreshToken,
  }, signal);
}

/** refresh_token 单次使用；旧实例沿轮换链取得最新会话。 */
const inFlightRefreshes = new Map<string, Promise<LxnsOAuthSession>>();
const recentRotations = new Map<string, LxnsOAuthSession>();
const rotationAncestors = new Map<string, Set<string>>();
const RECENT_ROTATIONS_LIMIT = 64;

function liveRotationTokens(): Set<string> {
  const live = new Set<string>();
  for (const [previousToken, next] of recentRotations) {
    live.add(previousToken);
    live.add(next.refreshToken);
  }
  for (const token of inFlightRefreshes.keys()) live.add(token);
  return live;
}

function pruneLxnsRotationState(): void {
  while (recentRotations.size > RECENT_ROTATIONS_LIMIT) {
    const oldest = recentRotations.keys().next().value;
    if (typeof oldest !== 'string') break;
    recentRotations.delete(oldest);
  }
  const live = liveRotationTokens();
  for (const token of rotationAncestors.keys()) {
    if (!live.has(token)) rotationAncestors.delete(token);
  }
  for (const [token, ancestors] of rotationAncestors) {
    for (const ancestor of ancestors) {
      if (!live.has(ancestor)) ancestors.delete(ancestor);
    }
    if (ancestors.size === 0) rotationAncestors.delete(token);
  }
}

function rememberLxnsRotation(refreshToken: string, next: LxnsOAuthSession): void {
  recentRotations.set(refreshToken, next);
  const ancestors = new Set(rotationAncestors.get(refreshToken) ?? []);
  ancestors.add(refreshToken);
  const nextAncestors = rotationAncestors.get(next.refreshToken) ?? new Set<string>();
  for (const token of ancestors) nextAncestors.add(token);
  rotationAncestors.set(next.refreshToken, nextAncestors);
  for (const [previousToken, previousNext] of recentRotations) {
    if (previousNext.refreshToken === refreshToken) {
      recentRotations.set(previousToken, next);
      nextAncestors.add(previousToken);
    }
  }
  pruneLxnsRotationState();
}

export function lxnsRotationAncestors(nextRefreshToken: string): readonly string[] {
  return [...(rotationAncestors.get(nextRefreshToken) ?? [])];
}

export async function rotateLxnsTokens(refreshToken: string): Promise<LxnsOAuthSession> {
  const aliases: string[] = [];
  const visited = new Set<string>();
  let currentToken = refreshToken;
  let cycleDetected = false;

  while (true) {
    if (visited.has(currentToken)) {
      cycleDetected = true;
      break;
    }
    visited.add(currentToken);
    const rotated = recentRotations.get(currentToken);
    if (!rotated) break;
    aliases.push(currentToken);
    if (!lxnsAccessTokenExpired(rotated)) {
      for (const alias of aliases) rememberLxnsRotation(alias, rotated);
      return rotated;
    }
    if (rotated.refreshToken === currentToken) {
      recentRotations.delete(currentToken);
      break;
    }
    currentToken = rotated.refreshToken;
  }

  if (cycleDetected) {
    for (const alias of aliases) recentRotations.delete(alias);
  }

  const existing = inFlightRefreshes.get(currentToken);
  if (existing) {
    const next = await existing;
    for (const alias of aliases) rememberLxnsRotation(alias, next);
    return next;
  }
  const promise = refreshLxnsAccessToken(currentToken)
    .then((next) => {
      rememberLxnsRotation(currentToken, next);
      for (const alias of aliases) rememberLxnsRotation(alias, next);
      return next;
    })
    .finally(() => {
      inFlightRefreshes.delete(currentToken);
    });
  inFlightRefreshes.set(currentToken, promise);
  return promise;
}

export type LxnsOAuthOutcome =
  | { status: 'success'; gameId: 'maimai' | 'chunithm'; accountName: string }
  | { status: 'error'; message: string };

const outcomeListeners = new Set<(outcome: LxnsOAuthOutcome) => void>();

export function subscribeLxnsOAuthOutcome(
  listener: (outcome: LxnsOAuthOutcome) => void,
): () => void {
  outcomeListeners.add(listener);
  return () => {
    outcomeListeners.delete(listener);
  };
}

export function notifyLxnsOAuthOutcome(outcome: LxnsOAuthOutcome): void {
  for (const listener of [...outcomeListeners]) {
    listener(outcome);
  }
}

export function lxnsAccessTokenExpired(session: LxnsOAuthSession, now = Date.now()): boolean {
  return session.expiresAt <= now + LXNS_TOKEN_REFRESH_SKEW_SECONDS * 1000;
}
