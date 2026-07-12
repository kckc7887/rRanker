import type { AuthProvider, LoginCredentials, ProviderSession } from './contracts';
import { ProviderError, providerErrorFromStatus } from './errors';

const BASE_URL = 'https://www.diving-fish.com/api/maimaidxprober';

export class DivingFishAuthProvider implements AuthProvider {
  loginWithPassword(credentials: LoginCredentials): Promise<ProviderSession> {
    return new Promise<ProviderSession>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${BASE_URL}/login`);
      xhr.withCredentials = true;
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.setRequestHeader('Content-Type', 'application/json');

      const timeout = setTimeout(() => xhr.abort(), 10_000);

      xhr.onload = () => {
        clearTimeout(timeout);
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(providerErrorFromStatus(xhr.status));
          return;
        }
        // iOS NSURLSession does not expose Set-Cookie via fetch headers, so XHR is required.
        const setCookie = xhr.getResponseHeader('Set-Cookie');
        const jwtFromHeader = setCookie?.match(/jwt_token=([^;]+)/)?.[1];
        if (jwtFromHeader) {
          resolve({ mode: 'jwt', value: jwtFromHeader, persistable: true });
          return;
        }
        const allHeaders = xhr.getAllResponseHeaders();
        const jwtFromAll = allHeaders.match(/set-cookie:.*jwt_token=([^;]+)/i)?.[1];
        if (jwtFromAll) {
          resolve({ mode: 'jwt', value: jwtFromAll, persistable: true });
          return;
        }
        // Expo Go sandbox blocks Set-Cookie access on iOS; cookie-jar mode is unreliable.
        reject(new ProviderError('authentication', '当前环境无法保存账密登录态，请改用 Import-Token', false));
      };

      xhr.onerror = () => {
        clearTimeout(timeout);
        reject(new ProviderError('network', '无法连接水鱼登录服务', true));
      };

      xhr.onabort = () => {
        clearTimeout(timeout);
        reject(new ProviderError('timeout', '登录请求超时', true));
      };

      xhr.ontimeout = () => {
        clearTimeout(timeout);
        reject(new ProviderError('timeout', '登录请求超时', true));
      };

      xhr.send(JSON.stringify(credentials));
    });
  }

  useImportToken(token: string): ProviderSession {
    const value = token.trim();
    if (!value) throw new ProviderError('authentication', 'Import-Token 不能为空', false);
    return { mode: 'import-token', value, persistable: true };
  }
}
