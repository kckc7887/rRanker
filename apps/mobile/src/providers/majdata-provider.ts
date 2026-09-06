import { fetch as expoFetch } from 'expo/fetch';
import MD5 from 'crypto-js/md5';
import { z } from 'zod';
import { MAJDATA_BASE, MajdataSongSchema, MajdataScoreSchema, MajdataRecentSchema, MajdataRankingSchema } from '@/domain/majdata';
import { requestJson, requestProviderResponse } from './http-json';
import { cookieHeader, responseCookies, type HttpCookieSession } from './http-cookies';
import { ProviderError, providerErrorFromStatus } from './errors';
import type { LoginCredentials } from './contracts';

export class MajdataProvider {
  constructor(private session?: HttpCookieSession, private readonly onSession?: (next: HttpCookieSession) => Promise<void>, private readonly fetcher: typeof fetch = expoFetch as unknown as typeof fetch) {}
  private options<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal) {
    return { path, schema, baseUrl: MAJDATA_BASE, label: 'Majdata Net', fetcher: this.fetcher, signal,
      error: (status: number) => providerErrorFromStatus(status, { authentication: '用户名或密码错误，请重新登录', permission: '账号暂时无法访问', noData: '未找到数据', rateLimit: '请稍后再试', server: 'Majdata Net 暂时不可用', fallback: { message: () => 'Majdata Net 请求失败' } }), init: { credentials: 'omit' as const, headers: this.session ? { Cookie: cookieHeader(this.session, `${MAJDATA_BASE}${path}`) } : {} as Record<string, string> },
      onResponse: async (response: Response) => {
        if (!this.session || signal?.aborted) return;
        const next = { ...this.session, cookies: responseCookies(response, this.session.cookies) };
        if (JSON.stringify(next.cookies) !== JSON.stringify(this.session.cookies)) { this.session = next; await this.onSession?.(next); }
      } };
  }
  async login(credentials: LoginCredentials, signal?: AbortSignal): Promise<HttpCookieSession> {
    const body = new FormData(); body.append('username', credentials.username.trim());
    body.append('password', MD5(credentials.password).toString()); body.append('rememberMe', 'true');
    let cookies: HttpCookieSession['cookies'] = [];
    await requestProviderResponse({ ...this.options('/account/Login', z.string(), signal), retries: 1,
      init: { method: 'POST', body, credentials: 'omit' },
      onResponse: response => { cookies = responseCookies(response); },
    }, response => response.text());
    if (!cookies.length) throw new ProviderError('authentication', '登录未完成，请重试', false);
    this.session = { mode: 'http-cookies', origin: 'https://majdata.net', cookies, persistable: true };
    await this.getPlayer(signal);
    return this.session;
  }
  getPlayer(signal?: AbortSignal) { return requestJson(this.options('/account/info/', z.object({ username: z.string().min(1) }), signal)); }
  getRecords(signal?: AbortSignal) { return requestJson(this.options('/account/scores', z.array(MajdataScoreSchema), signal)); }
  getRecent(username: string, signal?: AbortSignal) { return requestJson(this.options(`/account/Recent?username=${encodeURIComponent(username)}`, z.array(MajdataRecentSchema), signal)); }
  getSongs(page: number, sort: string, search: string, signal?: AbortSignal) {
    return requestJson(this.options(`/maichart/list?page=${page}&sort=${encodeURIComponent(sort)}&search=${encodeURIComponent(search)}`, z.array(MajdataSongSchema), signal));
  }
  getSong(id: string, signal?: AbortSignal) { return requestJson(this.options(`/maichart/${encodeURIComponent(id)}/summary`, MajdataSongSchema, signal)); }
  getRanking(id: string, signal?: AbortSignal) { return requestJson(this.options(`/maichart/${encodeURIComponent(id)}/score`, MajdataRankingSchema, signal)); }
  getChart(id: string, signal?: AbortSignal) { return requestProviderResponse(this.options(`/maichart/${encodeURIComponent(id)}/chart`, z.string().min(1), signal), response => response.text()); }
}
export const majdataProvider = new MajdataProvider();
