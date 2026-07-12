import { fetch as expoFetch } from 'expo/fetch';
import type { AuthProvider, LoginCredentials, ProviderSession } from './contracts';
import { ProviderError, providerErrorFromStatus } from './errors';

const BASE_URL = 'https://www.diving-fish.com/api/maimaidxprober';

type ExpoResponseWithRawHeaders = Response & { readonly _rawHeaders?: [string, string][] };

function jwtFromResponse(response: ExpoResponseWithRawHeaders): string | null {
  const rawSetCookie = response._rawHeaders
    ?.filter(([name]) => name.toLowerCase() === 'set-cookie')
    .map(([, value]) => value)
    .join('; ');
  const setCookie = rawSetCookie || response.headers.get('set-cookie');
  return setCookie?.match(/jwt_token=([^;]+)/i)?.[1] ?? null;
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
      if (jwt) return { mode: 'jwt', value: jwt, persistable: true };

      // expo/fetch stores HttpOnly cookies in the shared native cookie jar on iOS.
      return { mode: 'cookie-jar', persistable: false };
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
