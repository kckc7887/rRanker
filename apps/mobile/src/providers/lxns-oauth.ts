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
const PENDING_OAUTH_KEY = 'rranker.lxns.oauth.pending.v2';

/** 进行中的落雪授权：PKCE verifier + state + 发起绑定的游戏。 */
export type PendingLxnsOAuth = {
  verifier: string;
  state: string;
  gameId: 'maimai' | 'chunithm';
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

export async function beginLxnsAuthorize(input: {
  gameId: 'maimai' | 'chunithm';
}): Promise<string> {
  const { verifier, challenge } = await createPkcePair();
  const state = await createStateValue();
  const pending: PendingLxnsOAuth = { verifier, state, gameId: input.gameId };
  await SecureStore.setItemAsync(PENDING_OAUTH_KEY, JSON.stringify(pending), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return buildAuthorizeUrl(challenge, state);
}

export async function clearPendingLxnsVerifier(): Promise<void> {
  await SecureStore.deleteItemAsync(PENDING_OAUTH_KEY);
  await SecureStore.deleteItemAsync(PENDING_VERIFIER_KEY).catch(() => undefined);
}

/** 读取进行中的授权信息（回调页据此确定绑定目标游戏并校验 state）。 */
export async function readPendingLxnsOAuth(): Promise<PendingLxnsOAuth | null> {
  const raw = await SecureStore.getItemAsync(PENDING_OAUTH_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingLxnsOAuth>;
    if (typeof parsed.verifier !== 'string'
      || typeof parsed.state !== 'string'
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

export async function exchangeLxnsAuthorizationCode(
  code: string,
  expectState?: string,
): Promise<LxnsOAuthSession> {
  const trimmed = code.trim();
  if (!trimmed) throw new ProviderError('authentication', '缺少落雪授权码', false);
  const pending = await readPendingLxnsOAuth();
  if (!pending) {
    throw new ProviderError('authentication', '找不到本机 PKCE 验证信息，请重新打开授权页', false);
  }
  if (expectState !== undefined && pending.state !== expectState) {
    throw new ProviderError('authentication', '授权状态校验失败，请重新发起授权', false);
  }
  return exchangeWithVerifier(trimmed, pending.verifier);
}

async function exchangeWithVerifier(code: string, verifier: string): Promise<LxnsOAuthSession> {
  const session = await postToken({
    grant_type: 'authorization_code',
    code,
    client_id: LXNS_OAUTH_CLIENT_ID,
    redirect_uri: LXNS_OAUTH_REDIRECT_URI,
    code_verifier: verifier,
  });
  await clearPendingLxnsVerifier();
  return session;
}

export async function refreshLxnsAccessToken(refreshToken: string): Promise<LxnsOAuthSession> {
  return postToken({
    grant_type: 'refresh_token',
    client_id: LXNS_OAUTH_CLIENT_ID,
    refresh_token: refreshToken,
  });
}

/**
 * 落雪 refresh_token 刷新后立即失效：轮换链必须解析到最新一代，
 * 否则长驻实例会把过期的中间会话重新落盘。
 */
const inFlightRefreshes = new Map<string, Promise<LxnsOAuthSession>>();
const recentRotations = new Map<string, LxnsOAuthSession>();
const RECENT_ROTATIONS_LIMIT = 64;

function rememberLxnsRotation(refreshToken: string, next: LxnsOAuthSession): void {
  recentRotations.set(refreshToken, next);
  for (const [previousToken, previousNext] of recentRotations) {
    if (previousNext.refreshToken === refreshToken) {
      recentRotations.set(previousToken, next);
    }
  }
  while (recentRotations.size > RECENT_ROTATIONS_LIMIT) {
    const oldest = recentRotations.keys().next().value;
    if (typeof oldest !== 'string') break;
    recentRotations.delete(oldest);
  }
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

/** 落雪授权结果事件：回调页与登录 Sheet 之间的轻量通知。 */
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
