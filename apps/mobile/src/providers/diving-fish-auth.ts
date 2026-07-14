import { fetch as expoFetch } from 'expo/fetch';
import type { AuthProvider, LoginCredentials, ProviderSession } from './contracts';
import { ProviderError, providerErrorFromStatus } from './errors';

const BASE_URL = 'https://www.diving-fish.com/api/maimaidxprober';

type ExpoResponseWithRawHeaders = Response & { readonly _rawHeaders?: [string, string][] };

type AuthMode =
  | { kind: 'jwt'; jwt: string }
  | { kind: 'cookie-jar' };

function jwtFromResponse(response: ExpoResponseWithRawHeaders): string | null {
  const rawSetCookie = response._rawHeaders
    ?.filter(([name]) => name.toLowerCase() === 'set-cookie')
    .map(([, value]) => value)
    .join('; ');
  const setCookie = rawSetCookie || response.headers.get('set-cookie');
  return setCookie?.match(/jwt_token=([^;]+)/i)?.[1] ?? null;
}

async function divingFishRequest(
  path: string,
  authMode: AuthMode,
  init?: { method?: string },
): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const credentials = authMode.kind === 'cookie-jar' ? 'include' : 'omit';
  if (authMode.kind === 'jwt') {
    headers.Cookie = `jwt_token=${authMode.jwt}`;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await expoFetch(`${BASE_URL}${path}`, {
      method: init?.method ?? 'GET',
      headers,
      credentials,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && (error.name === 'AbortError' || controller.signal.aborted)) {
      throw new ProviderError('timeout', '水鱼请求超时', true, { cause: error });
    }
    throw new ProviderError('network', '无法连接水鱼服务', true, { cause: error });
  } finally {
    clearTimeout(timeout);
  }
}

async function readImportToken(authMode: AuthMode): Promise<string | null> {
  const response = await divingFishRequest('/player/profile', authMode);
  if (!response.ok) {
    throw providerErrorFromStatus(response.status);
  }
  const payload = await response.json() as { import_token?: unknown };
  return typeof payload.import_token === 'string' && payload.import_token.trim()
    ? payload.import_token.trim()
    : null;
}

/** 登录后换取 Import-Token：已有则复用，没有则 PUT 生成。只把 Token 写入 SecureStore，不落明文其它介质。 */
async function obtainImportTokenSession(authMode: AuthMode): Promise<ProviderSession> {
  let token = await readImportToken(authMode);
  if (!token) {
    const create = await divingFishRequest('/player/import_token', authMode, { method: 'PUT' });
    if (!create.ok) {
      throw providerErrorFromStatus(create.status);
    }
    await create.text().catch(() => undefined);
    token = await readImportToken(authMode);
  }
  if (!token) {
    throw new ProviderError('authentication', '无法获取水鱼上传凭证', false);
  }
  return { mode: 'import-token', value: token, persistable: true };
}

export class DivingFishAuthProvider implements AuthProvider {
  async loginWithPassword(credentials: LoginCredentials): Promise<ProviderSession> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await expoFetch(`${BASE_URL}/login`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
        credentials: 'include',
        signal: controller.signal,
      });
      if (!response.ok) throw providerErrorFromStatus(response.status);

      // Wait for URLSession to finish processing the response and persist Set-Cookie.
      await response.text();
      const jwt = jwtFromResponse(response);
      const authMode: AuthMode = jwt
        ? { kind: 'jwt', jwt }
        : { kind: 'cookie-jar' };

      return await obtainImportTokenSession(authMode);
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (error instanceof Error && (error.name === 'AbortError' || controller.signal.aborted)) {
        throw new ProviderError('timeout', '登录请求超时', true, { cause: error });
      }
      throw new ProviderError('network', '无法连接水鱼登录服务', true, { cause: error });
    } finally {
      clearTimeout(timeout);
    }
  }

  useImportToken(token: string): ProviderSession {
    const value = token.trim();
    if (!value) throw new ProviderError('authentication', 'Import-Token 不能为空', false);
    return { mode: 'import-token', value, persistable: true };
  }
}
