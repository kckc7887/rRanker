export type HttpCookie = { name: string; value: string; path: string; expiresAt?: number; secure: boolean };
export type HttpCookieSession = { mode: 'http-cookies'; origin: string; cookies: HttpCookie[]; persistable: true };

export function responseCookies(response: Response, previous: readonly HttpCookie[] = [], now = Date.now()): HttpCookie[] {
  const raw = (response as Response & { _rawHeaders?: [string, string][] })._rawHeaders;
  const rawCookies = raw?.filter(([name]) => name.toLowerCase() === 'set-cookie').map(([, value]) => value);
  const getSetCookie = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const headerValues = rawCookies?.length ? rawCookies : getSetCookie ? getSetCookie.call(response.headers) : [response.headers.get('set-cookie') ?? ''];
  const result = new Map(previous.filter(c => c.expiresAt === undefined || c.expiresAt > now).map(c => [`${c.name}:${c.path}`, c]));
  for (const header of headerValues.flatMap(value => value.split(/,(?=\s*[^;,=\s]+=)/))) {
    const [pair, ...attributes] = header.split(';').map(part => part.trim());
    const equal = pair.indexOf('=');
    if (equal < 1) continue;
    const cookie: HttpCookie = { name: pair.slice(0, equal), value: pair.slice(equal + 1), path: '/', secure: false };
    if (!/^[!#$%&'*+.^_`|~\w-]+$/.test(cookie.name) || /[\r\n;]/.test(cookie.value)) continue;
    let maxAge: number | undefined;
    for (const attribute of attributes) {
      const [key, ...parts] = attribute.split('=');
      const value = parts.join('=');
      switch (key.toLowerCase()) {
        case 'path': cookie.path = value.startsWith('/') ? value : '/'; break;
        case 'secure': cookie.secure = true; break;
        case 'max-age': if (/^-?\d+$/.test(value)) maxAge = Number(value); break;
        case 'expires': { const expires = Date.parse(value); if (Number.isFinite(expires)) cookie.expiresAt = expires; break; }
      }
    }
    if (maxAge !== undefined) cookie.expiresAt = now + maxAge * 1000;
    const key = `${cookie.name}:${cookie.path}`;
    if (cookie.expiresAt !== undefined && cookie.expiresAt <= now) result.delete(key);
    else result.set(key, cookie);
  }
  return [...result.values()];
}

export function cookieHeader(session: HttpCookieSession, address: string, now = Date.now()): string {
  const url = new URL(address);
  if (url.origin !== session.origin) return '';
  return session.cookies.filter(c => (!c.secure || url.protocol === 'https:')
    && (c.expiresAt === undefined || c.expiresAt > now)
    && (url.pathname === c.path || url.pathname.startsWith(c.path.endsWith('/') ? c.path : `${c.path}/`)))
    .sort((a, b) => b.path.length - a.path.length).map(c => `${c.name}=${c.value}`).join('; ');
}

export function isHttpCookieSession(value: unknown): value is HttpCookieSession {
  if (!value || typeof value !== 'object') return false;
  const s = value as HttpCookieSession;
  return s.mode === 'http-cookies' && s.persistable === true && typeof s.origin === 'string'
    && /^https:\/\/[^/]+$/.test(s.origin) && Array.isArray(s.cookies) && s.cookies.length > 0
    && s.cookies.every(c => typeof c.name === 'string' && /^[!#$%&'*+.^_`|~\w-]+$/.test(c.name)
      && typeof c.value === 'string' && !/[\r\n;]/.test(c.value) && typeof c.path === 'string' && c.path.startsWith('/')
      && typeof c.secure === 'boolean' && (c.expiresAt === undefined || Number.isFinite(c.expiresAt)));
}
