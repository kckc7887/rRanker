import { fetch as expoFetch } from 'expo/fetch';
import { z } from 'zod';
import type { AuthProvider, LoginCredentials, ProviderSession } from './contracts';
import { ProviderError, providerErrorFromStatus } from './errors';
import { requestProviderResponse } from './http-json';

const BASE_URL = 'https://www.diving-fish.com/api/maimaidxprober';

type ExpoResponseWithRawHeaders = Response & { readonly _rawHeaders?: [string, string][] };

type AuthMode = { kind: 'jwt'; jwt: string };

function jwtFromResponse(response: ExpoResponseWithRawHeaders): string | null {
  const rawSetCookie = response._rawHeaders
    ?.filter(([name]) => name.toLowerCase() === 'set-cookie')
    .map(([, value]) => value)
    .join('; ');
  const setCookie = rawSetCookie || response.headers.get('set-cookie');
  return setCookie?.match(/jwt_token=([^;]+)/i)?.[1] ?? null;
}

function divingFishRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  read: (response: Response) => Promise<unknown>,
  authMode?: AuthMode,
  init?: RequestInit,
  onResponse?: (response: Response) => void,
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (authMode) {
    headers.Cookie = `jwt_token=${authMode.jwt}`;
  }
  new Headers(init?.headers).forEach((value, key) => { headers[key] = value; });
  return requestProviderResponse({ baseUrl: BASE_URL, path, schema,
    fetcher: expoFetch as unknown as typeof fetch, label: '水鱼', authenticated: true,
    totalAttempts: 1, maxResponseBytes: 256 * 1024, error: providerErrorFromStatus,
    messages: { timeout: '水鱼请求超时', network: '无法连接水鱼服务', schema: '水鱼返回了无效数据' },
    init: { ...init, headers }, onResponse,
  }, read);
}

async function readImportToken(authMode: AuthMode): Promise<string | null> {
  const payload = await divingFishRequest('/player/profile', z.object({ import_token: z.unknown().optional() }), response => response.json(), authMode);
  return typeof payload.import_token === 'string' && payload.import_token.trim()
    ? payload.import_token.trim()
    : null;
}

/** 登录后换取 Import-Token：已有则复用，没有则 PUT 生成。只把 Token 写入 SecureStore，不落明文其它介质。 */
async function obtainImportTokenSession(authMode: AuthMode): Promise<ProviderSession> {
  let token = await readImportToken(authMode);
  if (!token) {
    await divingFishRequest('/player/import_token', z.string(), response => response.text(), authMode, { method: 'PUT' });
    token = await readImportToken(authMode);
  }
  if (!token) {
    throw new ProviderError('authentication', '无法获取水鱼上传凭证', false);
  }
  return { mode: 'import-token', value: token, persistable: true };
}

export class DivingFishAuthProvider implements AuthProvider {
  async loginWithPassword(credentials: LoginCredentials): Promise<ProviderSession> {
    let jwt: string | null = null;
    await divingFishRequest('/login', z.string(), response => response.text(), undefined, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      }, response => { jwt = jwtFromResponse(response); });
    if (!jwt) throw new ProviderError('authentication', '水鱼登录响应缺少本次会话凭证，请重试或使用 Import-Token', false);
    return obtainImportTokenSession({ kind: 'jwt', jwt });
  }

  useImportToken(token: string): ProviderSession {
    const value = token.trim();
    if (!value) throw new ProviderError('authentication', 'Import-Token 不能为空', false);
    return { mode: 'import-token', value, persistable: true };
  }
}
