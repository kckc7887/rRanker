import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { fetch as expoFetch } from 'expo/fetch';
import { z } from 'zod';
import type { ProviderSession } from './contracts';
import { ProviderError, runProviderOperation } from './errors';
import { requestProviderResponse } from './http-json';
import {
  OSU_OAUTH_AUTHORIZE_URL,
  OSU_OAUTH_CLIENT_ID,
  OSU_OAUTH_REDIRECT_URI,
  OSU_OAUTH_SCOPE,
  OSU_OAUTH_TOKEN_URL,
  OSU_TOKEN_REFRESH_SKEW_SECONDS,
  osuOAuthClientSecret,
} from './osu-config';
const PENDING_OAUTH_KEY = 'rranker.osu.oauth.pending.v1';
const OSU_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
let pendingMutation: Promise<unknown> = Promise.resolve();
function withPendingMutation<T>(action: () => Promise<T>): Promise<T> {
  const result = pendingMutation.then(action, action);
  pendingMutation = result.catch(() => undefined);
  return result;
}

/** 进行中的 osu! 授权：state（osu! 无 PKCE，凭 state 防 CSRF）。 */
export type PendingOsuOAuth = {
  state: string;
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
  hint: z.string().optional(),
}).passthrough();

export type OsuOAuthSession = Extract<ProviderSession, { mode: 'osu-oauth' }>;

function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = typeof btoa === 'function'
    ? btoa(binary)
    : Buffer.from(bytes).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function createStateValue(): Promise<string> {
  return base64UrlFromBytes(await Crypto.getRandomBytesAsync(16));
}

export function buildAuthorizeUrl(state: string): string {
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: OSU_OAUTH_CLIENT_ID,
    redirect_uri: OSU_OAUTH_REDIRECT_URI,
    scope: OSU_OAUTH_SCOPE,
    state,
  });
  return `${OSU_OAUTH_AUTHORIZE_URL}?${query.toString()}`;
}

export async function beginOsuAuthorize(): Promise<string> {
  const state = await createStateValue();
  const pending: PendingOsuOAuth = { state, expiresAt: Date.now() + OSU_OAUTH_STATE_TTL_MS };
  await withPendingMutation(() => SecureStore.setItemAsync(PENDING_OAUTH_KEY, JSON.stringify(pending), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  }));
  return buildAuthorizeUrl(state);
}

export async function clearPendingOsuOAuth(): Promise<void> {
  await withPendingMutation(() => SecureStore.deleteItemAsync(PENDING_OAUTH_KEY));
}

async function loadPendingOsuOAuth(): Promise<PendingOsuOAuth | null> {
  const raw = await runProviderOperation('credential_storage', () => SecureStore.getItemAsync(PENDING_OAUTH_KEY));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingOsuOAuth>;
    if (typeof parsed.state !== 'string' || !parsed.state.trim()) return null;
    if (typeof parsed.expiresAt !== 'number' || !Number.isFinite(parsed.expiresAt)) return null;
    return { state: parsed.state, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

function parseTokenPayload(payload: unknown): z.infer<typeof TokenResponseSchema> {
  if (payload && typeof payload === 'object') {
    const parsed = TokenResponseSchema.safeParse(payload);
    if (parsed.success) return parsed.data;
  }
  throw new ProviderError('upstream_schema', 'osu! OAuth token 响应与已验证契约不一致', true);
}

function toSession(token: z.infer<typeof TokenResponseSchema>): OsuOAuthSession {
  return {
    mode: 'osu-oauth',
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: Date.now() + token.expires_in * 1000,
    persistable: true,
  };
}

async function postToken(body: Record<string, string>, signal?: AbortSignal): Promise<OsuOAuthSession> {
  if (!body.client_secret) {
    throw new ProviderError('configuration', 'osu! 应用凭据缺失，当前构建无法完成授权', false);
  }
  return requestProviderResponse({
    baseUrl: OSU_OAUTH_TOKEN_URL, path: '', schema: TokenResponseSchema,
    fetcher: expoFetch as unknown as typeof fetch, label: 'osu! OAuth',
    totalAttempts: 1, signal, authenticated: true, maxResponseBytes: 256 * 1024,
    error: status => new ProviderError(status === 400 || status === 401 ? 'authentication' : 'network', 'osu! 授权失败，请重新发起授权', status >= 500),
    onHttpError: async response => {
      let payload: unknown = null;
      try { payload = await response.json(); } catch (error) { if (!(error instanceof SyntaxError)) throw error; }
      const parsed = OAuthErrorSchema.safeParse(payload);
      const authentication = response.status === 400 || response.status === 401 || (parsed.success && parsed.data.error === 'invalid_grant');
      return new ProviderError(authentication ? 'authentication' : 'network', 'osu! 授权失败，请重新发起授权', response.status >= 500);
    },
    messages: { schema: 'osu! OAuth token 响应与已验证契约不一致', timeout: 'osu! OAuth 超时', network: '无法连接 osu! OAuth' },
    init: {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(body).toString(),
    },
  }, async response => parseTokenPayload(await response.json())).then(toSession);
}

export function requireOsuOAuthState(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) {
    throw new ProviderError('authorization_callback', '授权状态校验失败，请重新发起授权', false);
  }
  return value;
}

export async function exchangeOsuAuthorizationCode(
  code: string,
  expectState: string,
  signal?: AbortSignal,
): Promise<OsuOAuthSession> {
  const trimmed = code.trim();
  const state = requireOsuOAuthState(expectState);
  if (!trimmed) throw new ProviderError('authentication', '缺少 osu! 授权码', false);
  await withPendingMutation(async () => {
    if (signal?.aborted) throw signal.reason;
    const pending = await loadPendingOsuOAuth();
    if (!pending) throw new ProviderError('authorization_callback', '找不到本机授权信息，请重新打开授权页', false);
    if (pending.expiresAt <= Date.now()) {
      await runProviderOperation('credential_storage', () => SecureStore.deleteItemAsync(PENDING_OAUTH_KEY));
      throw new ProviderError('authorization_callback', '授权已过期，请重新发起授权', false);
    }
    if (pending.state !== state) throw new ProviderError('authorization_callback', '授权状态校验失败，请重新发起授权', false);
    await runProviderOperation('credential_storage', () => SecureStore.deleteItemAsync(PENDING_OAUTH_KEY));
  });
  const session = await postToken({
    grant_type: 'authorization_code',
    code: trimmed,
    client_id: OSU_OAUTH_CLIENT_ID,
    client_secret: osuOAuthClientSecret(),
    redirect_uri: OSU_OAUTH_REDIRECT_URI,
  }, signal);
  return session;
}

async function refreshOsuAccessToken(refreshToken: string): Promise<OsuOAuthSession> {
  return postToken({
    grant_type: 'refresh_token',
    client_id: OSU_OAUTH_CLIENT_ID,
    client_secret: osuOAuthClientSecret(),
    refresh_token: refreshToken,
  });
}

/**
 * 公共令牌轮换：并发刷新按 refreshToken 去重（复用 snapshot-cache-utils 的
 * createInflightGuard），并缓存最近的轮换结果。osu! refresh_token 单次使用：
 * 持有旧 token 的实例可从缓存直接拿到本进程内最新会话，避免 invalid_grant。
 */
const inFlightRefreshes = new Map<string, Promise<OsuOAuthSession>>();
const recentRotations = new Map<string, OsuOAuthSession>();
const rotationAncestors = new Map<string, Set<string>>();
const RECENT_ROTATIONS_LIMIT = 64;
let rotationEpoch = 0;

function liveRotationTokens(): Set<string> {
  const live = new Set<string>();
  for (const [previousToken, next] of recentRotations) {
    live.add(previousToken);
    live.add(next.refreshToken);
  }
  for (const token of inFlightRefreshes.keys()) live.add(token);
  return live;
}

function pruneRotationState(): void {
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

function rememberOsuRotation(refreshToken: string, next: OsuOAuthSession): void {
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
  pruneRotationState();
}

/** 解除绑定或清空会话时丢掉轮换关系。进行中的刷新完成后不再写回。 */
export function clearOsuRotationCache(): void {
  rotationEpoch += 1;
  recentRotations.clear();
  rotationAncestors.clear();
  inFlightRefreshes.clear();
}

export function osuRotationCacheStats(): {
  rotations: number;
  ancestors: number;
  ancestorMembers: number;
  inFlight: number;
} {
  let ancestorMembers = 0;
  for (const ancestors of rotationAncestors.values()) ancestorMembers += ancestors.size;
  return {
    rotations: recentRotations.size,
    ancestors: rotationAncestors.size,
    ancestorMembers,
    inFlight: inFlightRefreshes.size,
  };
}

/** 当前凭据是这次轮换结果的前代时才允许覆盖。重新登录产生的新凭据不在前代集合里。 */
export function osuRotationMayReplace(currentRefreshToken: string, nextRefreshToken: string): boolean {
  if (currentRefreshToken === nextRefreshToken) return true;
  return rotationAncestors.get(nextRefreshToken)?.has(currentRefreshToken) ?? false;
}

export function osuRotationAncestors(nextRefreshToken: string): readonly string[] {
  return [...(rotationAncestors.get(nextRefreshToken) ?? [])];
}

export async function rotateOsuTokens(refreshToken: string): Promise<OsuOAuthSession> {
  const epoch = rotationEpoch;
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
    if (!osuAccessTokenExpired(rotated)) {
      for (const alias of aliases) rememberOsuRotation(alias, rotated);
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
    if (epoch === rotationEpoch) {
      for (const alias of aliases) rememberOsuRotation(alias, next);
    }
    return next;
  }
  const promise = refreshOsuAccessToken(currentToken)
    .then((next) => {
      if (epoch !== rotationEpoch) return next;
      rememberOsuRotation(currentToken, next);
      for (const alias of aliases) rememberOsuRotation(alias, next);
      return next;
    })
    .finally(() => {
      inFlightRefreshes.delete(currentToken);
    });
  inFlightRefreshes.set(currentToken, promise);
  return promise;
}

/** osu! 授权结果事件：回调页与登录 Sheet 之间的轻量通知。 */
export type OsuOAuthOutcome =
  | { status: 'success'; accountName: string }
  | { status: 'error'; message: string }
  /** 授权码已换取、回调页进入模式选择：通知登录 Sheet 关闭，避免 Modal 盖住回调页。 */
  | { status: 'awaiting-mode-selection' };

const outcomeListeners = new Set<(outcome: OsuOAuthOutcome) => void>();

export function subscribeOsuOAuthOutcome(
  listener: (outcome: OsuOAuthOutcome) => void,
): () => void {
  outcomeListeners.add(listener);
  return () => {
    outcomeListeners.delete(listener);
  };
}

export function notifyOsuOAuthOutcome(outcome: OsuOAuthOutcome): void {
  for (const listener of [...outcomeListeners]) {
    listener(outcome);
  }
}

export function osuAccessTokenExpired(session: OsuOAuthSession, now = Date.now()): boolean {
  return session.expiresAt <= now + OSU_TOKEN_REFRESH_SKEW_SECONDS * 1000;
}
