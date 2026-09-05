import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { fetch as expoFetch } from 'expo/fetch';
import { z } from 'zod';
import type { ProviderSession } from './contracts';
import { ProviderError } from './errors';
import {
  OSU_OAUTH_AUTHORIZE_URL,
  OSU_OAUTH_CLIENT_ID,
  OSU_OAUTH_CLIENT_SECRET,
  OSU_OAUTH_REDIRECT_URI,
  OSU_OAUTH_SCOPE,
  OSU_OAUTH_TOKEN_URL,
  OSU_TOKEN_REFRESH_SKEW_SECONDS,
} from './osu-config';
import { createInflightGuard } from '@/services/snapshot-cache-utils';

const PENDING_OAUTH_KEY = 'rranker.osu.oauth.pending.v1';

/** 进行中的 osu! 授权：state（osu! 无 PKCE，凭 state 防 CSRF）。 */
export type PendingOsuOAuth = {
  state: string;
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

export function buildAuthorizeUrl(state?: string): string {
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: OSU_OAUTH_CLIENT_ID,
    redirect_uri: OSU_OAUTH_REDIRECT_URI,
    scope: OSU_OAUTH_SCOPE,
  });
  if (state) query.set('state', state);
  return `${OSU_OAUTH_AUTHORIZE_URL}?${query.toString()}`;
}

export async function beginOsuAuthorize(): Promise<string> {
  const state = await createStateValue();
  const pending: PendingOsuOAuth = { state };
  await SecureStore.setItemAsync(PENDING_OAUTH_KEY, JSON.stringify(pending), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return buildAuthorizeUrl(state);
}

export async function clearPendingOsuOAuth(): Promise<void> {
  await SecureStore.deleteItemAsync(PENDING_OAUTH_KEY);
}

/** 读取进行中的授权信息（回调页据此校验 state）。 */
export async function readPendingOsuOAuth(): Promise<PendingOsuOAuth | null> {
  const raw = await SecureStore.getItemAsync(PENDING_OAUTH_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingOsuOAuth>;
    if (typeof parsed.state !== 'string' || !parsed.state) return null;
    return parsed as PendingOsuOAuth;
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

async function postToken(body: Record<string, string>): Promise<OsuOAuthSession> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await expoFetch(OSU_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(body).toString(),
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
        `osu! 授权失败：${description}`,
        response.status >= 500,
      );
    }
    return toSession(parseTokenPayload(payload));
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if ((controller.signal.aborted || (error instanceof Error && error.name === 'AbortError'))) {
      throw new ProviderError('timeout', 'osu! OAuth 超时', true, { cause: error });
    }
    throw new ProviderError('network', '无法连接 osu! OAuth', true, { cause: error });
  } finally {
    clearTimeout(timeout);
  }
}

export async function exchangeOsuAuthorizationCode(
  code: string,
  expectState?: string,
): Promise<OsuOAuthSession> {
  const trimmed = code.trim();
  if (!trimmed) throw new ProviderError('authentication', '缺少 osu! 授权码', false);
  const pending = await readPendingOsuOAuth();
  if (!pending) {
    throw new ProviderError('authentication', '找不到本机授权信息，请重新打开授权页', false);
  }
  if (expectState !== undefined && pending.state !== expectState) {
    throw new ProviderError('authentication', '授权状态校验失败，请重新发起授权', false);
  }
  const session = await postToken({
    grant_type: 'authorization_code',
    code: trimmed,
    client_id: OSU_OAUTH_CLIENT_ID,
    client_secret: OSU_OAUTH_CLIENT_SECRET,
    redirect_uri: OSU_OAUTH_REDIRECT_URI,
  });
  await clearPendingOsuOAuth();
  return session;
}

async function refreshOsuAccessToken(refreshToken: string): Promise<OsuOAuthSession> {
  return postToken({
    grant_type: 'refresh_token',
    client_id: OSU_OAUTH_CLIENT_ID,
    client_secret: OSU_OAUTH_CLIENT_SECRET,
    refresh_token: refreshToken,
  });
}

/**
 * 公共令牌轮换：并发刷新按 refreshToken 去重（复用 snapshot-cache-utils 的
 * createInflightGuard），并缓存最近的轮换结果。osu! refresh_token 单次使用：
 * 持有旧 token 的实例可从缓存直接拿到本进程内最新会话，避免 invalid_grant。
 */
const refreshInflight = createInflightGuard<string>();
const recentRotations = new Map<string, OsuOAuthSession>();
const RECENT_ROTATIONS_LIMIT = 64;

export async function rotateOsuTokens(refreshToken: string): Promise<OsuOAuthSession> {
  const recent = recentRotations.get(refreshToken);
  if (recent) return recent;
  return refreshInflight.dedupe(refreshToken, async () => {
    const next = await refreshOsuAccessToken(refreshToken);
    recentRotations.set(refreshToken, next);
    if (recentRotations.size > RECENT_ROTATIONS_LIMIT) {
      const oldest = recentRotations.keys().next().value;
      if (typeof oldest === 'string') recentRotations.delete(oldest);
    }
    return next;
  });
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
