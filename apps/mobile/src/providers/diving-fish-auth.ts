import type { AuthProvider, LoginCredentials, ProviderSession } from './contracts';
import { ProviderError, providerErrorFromStatus } from './errors';

const BASE_URL = 'https://www.diving-fish.com/api/maimaidxprober';

export class DivingFishAuthProvider implements AuthProvider {
  async loginWithPassword(credentials: LoginCredentials): Promise<ProviderSession> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(`${BASE_URL}/login`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials), credentials: 'include', signal: controller.signal,
      });
      if (!response.ok) throw providerErrorFromStatus(response.status);
      const setCookie = response.headers.get('set-cookie');
      const jwt = setCookie?.match(/(?:^|;)\s*jwt_token=([^;]+)/)?.[1];
      if (jwt) return { mode: 'jwt', value: jwt, persistable: true };
      // Expo Go may keep the cookie in its native jar without exposing Set-Cookie.
      return { mode: 'cookie-jar', persistable: false };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ProviderError('timeout', '登录请求超时', true, { cause: error });
      }
      throw new ProviderError('network', '无法连接水鱼登录服务', true, { cause: error });
    } finally { clearTimeout(timeout); }
  }

  useImportToken(token: string): ProviderSession {
    const value = token.trim();
    if (!value) throw new ProviderError('authentication', 'Import-Token 不能为空', false);
    return { mode: 'import-token', value, persistable: true };
  }
}
