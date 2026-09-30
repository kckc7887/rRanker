import { fetch as nativeFetch } from 'expo/fetch';

export const ACCOUNT_PROBE_ORIGIN = 'http://127.0.0.1:8766';
const routes = new Map([
  ['https://maimai.lxns.net/api/v0/user/maimai/player', '/lxns/player'],
  ['https://maimai.lxns.net/api/v0/user/maimai/player/scores', '/lxns/scores'],
  ['https://api.maiscorehub.bakapiano.com/api/v1/me', '/scorehub/me'],
]);

/** Test build only: retain native transport and the caller's response-origin contract. */
export function createAccountProbeFetch(transport: typeof nativeFetch): typeof nativeFetch {
  return async (input, init) => {
    if (typeof input !== 'string') throw new Error('Account probe requires a URL string');
    const original = new URL(input);
    const fixture = original.origin === ACCOUNT_PROBE_ORIGIN && original.pathname === '/fixture'
      && /^[a-f0-9]{32}$/.test(original.searchParams.get('run') ?? '')
      && [...original.searchParams.keys()].length === 1;
    const route = routes.get(original.href);
    if (!route && !fixture) throw new Error('Account probe destination rejected');
    if ((init?.method ?? 'GET') !== 'GET' || init?.body != null) throw new Error('Account probe method rejected');
    const destination = fixture ? original.href : `${ACCOUNT_PROBE_ORIGIN}${route}`;
    const response = await transport(destination, { ...init, redirect: 'error', credentials: 'omit' });
    if (response.redirected || response.url !== destination) throw new Error('Account probe response origin rejected');
    return new Proxy(Object.create(Object.getPrototypeOf(response)) as typeof response, {
      get(_target, property) {
        if (property === 'url') return original.href;
        const value = Reflect.get(response, property, response);
        return typeof value === 'function' ? value.bind(response) : value;
      },
    });
  };
}

export const fetch = createAccountProbeFetch(nativeFetch);
