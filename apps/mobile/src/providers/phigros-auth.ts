import { z } from 'zod';
import { fetch as expoFetch } from 'expo/fetch';
import { Base64, HmacSHA1, MD5 } from '@/utils/crypto-subset';
import { ProviderError } from './errors';
import { requestBytes, requestJson } from './http-json';

const TAPTAP_CLIENT_ID = 'rAK3FfdieFob2Nn8Am';
const TAPTAP_SCOPE = 'public_profile';
const LC_SERVER = 'https://rak3ffdi.cloud.tds1.tapapis.cn';
const LC_APP_KEY = 'Qr9AEqtuoSVS3zeD6iVbM4ZC0AtkJcQ89tywVyi0';

const DeviceCodeDataSchema = z.object({
  device_code: z.string().min(1),
  qrcode_url: z.string(),
  expires_in: z.number().int().positive(),
  interval: z.number().int().positive().optional(),
});

const DeviceCodeResponseSchema = z.object({
  success: z.literal(true),
  data: DeviceCodeDataSchema,
});

const TokenDataSchema = z.object({
  kid: z.string(),
  access_token: z.string(),
  mac_key: z.string(),
  mac_algorithm: z.string().optional(),
  expires_in: z.number().optional(),
});

const TokenResponseSchema = z.object({
  success: z.literal(true),
  data: TokenDataSchema,
});

const TokenErrorSchema = z.object({
  success: z.literal(false).optional(),
  data: z.object({ error: z.string() }).optional(),
  error_description: z.string().optional(),
});

const ProfileDataSchema = z.object({
  openid: z.string(),
  name: z.string(),
  avatar: z.string(),
});

const ProfileResponseSchema = z.object({
  data: ProfileDataSchema,
});

const SessionTokenResponseSchema = z.object({
  sessionToken: z.string(),
});

const PlayerIdResponseSchema = z.object({
  nickname: z.string(),
});

const GameSaveResponseSchema = z.object({
  results: z.array(z.object({
    summary: z.string(),
    gameFile: z.object({ url: z.string() }),
    updatedAt: z.string(),
  })),
});

export type GameSaveMeta = {
  summaryBase64: string;
  saveUrl: string;
  updatedAt: string;
};

export function pickLatestGameSave(
  results: { summary: string; gameFile: { url: string }; updatedAt: string }[],
): GameSaveMeta {
  const candidates = results.filter((item) => item.summary && item.gameFile?.url);
  if (!candidates.length) {
    throw new Error('云存档列表为空，请先在游戏内同步云存档');
  }
  const latest = candidates.reduce((best, cur) =>
    (Date.parse(cur.updatedAt) > Date.parse(best.updatedAt) ? cur : best),
  );
  return {
    summaryBase64: latest.summary,
    saveUrl: latest.gameFile.url,
    updatedAt: latest.updatedAt,
  };
}

export type DeviceCodeResult = {
  deviceCode: string;
  qrcodeUrl: string;
  deviceId: string;
  expiresIn: number;
  interval: number;
};

export type TapTapToken = z.infer<typeof TokenDataSchema>;

export type PhigrosSession = {
  sessionToken: string;
  playerId: string;
};

function randStr(len: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function phigrosJson<T>(url: string, schema: z.ZodType<T>, options: {
  init?: RequestInit; signal?: AbortSignal; timeoutMs?: number;
} = {}): Promise<T> {
  const parsed = new URL(url);
  const label = parsed.origin === LC_SERVER ? 'LeanCloud' : 'TapTap';
  return requestJson({
    baseUrl: parsed.origin, path: parsed.pathname + parsed.search, schema,
    fetcher: expoFetch as unknown as typeof fetch,
    authenticated: true, totalAttempts: 1, timeoutMs: options.timeoutMs ?? 15_000,
    init: options.init, signal: options.signal, label, diagnosticScenario: 'metadata',
    error: status => new ProviderError('network', `${label} 请求失败（HTTP ${status}）`, status === 429 || status >= 500),
  });
}

function postForm(url: string, body: Record<string, string>, signal?: AbortSignal): Promise<unknown> {
  return phigrosJson(url, z.unknown(), { signal, init: {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  } });
}

export async function requestDeviceCode(signal?: AbortSignal): Promise<DeviceCodeResult> {
  const deviceId = randStr(32);
  const raw = await postForm('https://accounts.tapapis.cn/oauth2/v1/device/code', {
    client_id: TAPTAP_CLIENT_ID,
    response_type: 'device_code',
    scope: TAPTAP_SCOPE,
    platform: 'unity',
    info: JSON.stringify({ device_id: deviceId }),
  }, signal);

  const parsed = DeviceCodeResponseSchema.parse(raw);
  return {
    deviceCode: parsed.data.device_code,
    qrcodeUrl: parsed.data.qrcode_url,
    deviceId,
    expiresIn: parsed.data.expires_in,
    interval: parsed.data.interval ?? 5,
  };
}

export async function pollForToken(
  deviceCode: string,
  deviceId: string,
  signal?: AbortSignal,
): Promise<TapTapToken | 'pending' | 'waiting' | 'slowdown'> {
  const raw = await postForm('https://accounts.tapapis.cn/oauth2/v1/token', {
    grant_type: 'device_token',
    client_id: TAPTAP_CLIENT_ID,
    code: deviceCode,
    info: JSON.stringify({ device_id: deviceId }),
  }, signal);

  const success = TokenResponseSchema.safeParse(raw);
  if (success.success) return success.data.data;

  const err = TokenErrorSchema.safeParse(raw);
  const error = err.success ? err.data.data?.error ?? err.data.error_description : 'unknown';
  if (error === 'authorization_pending') return 'pending';
  if (error === 'authorization_waiting') return 'waiting';
  if (error === 'slow_down') return 'slowdown';
  throw new Error(error ?? 'TapTap 登录失败');
}

async function getProfile(
  token: TapTapToken,
  signal?: AbortSignal,
): Promise<z.infer<typeof ProfileDataSchema>> {
  const url = `https://open.tapapis.cn/account/profile/v1?client_id=${TAPTAP_CLIENT_ID}`;
  const parsed = new URL(url);
  const method = 'GET';
  const ts = String(Math.floor(Date.now() / 1000)).padStart(10, '0');
  const nonce = randStr(16);
  const uri = parsed.pathname + parsed.search;
  const host = parsed.hostname;
  const port = '443';
  const sigBase = `${ts}\n${nonce}\n${method}\n${uri}\n${host}\n${port}\n\n`;

  const mac = Base64.stringify(
    HmacSHA1(sigBase, token.mac_key),
  );

  return (await phigrosJson(url, ProfileResponseSchema, { signal, init: {
    headers: { Authorization: `MAC id="${token.kid}", ts="${ts}", nonce="${nonce}", mac="${mac}"` },
  } })).data;
}

export async function exchangeSessionToken(
  token: TapTapToken,
  signal?: AbortSignal,
): Promise<PhigrosSession> {
  const profile = await getProfile(token, signal);
  const ts = String(Math.floor(Date.now() / 1000));

  const lcHash = MD5(ts + LC_APP_KEY).toString();
  const lcSign = `${lcHash},${ts}`;

  const { sessionToken } = await phigrosJson(`${LC_SERVER}/1.1/users`, SessionTokenResponseSchema, { signal, init: {
      method: 'POST',
      headers: {
        'X-LC-Id': TAPTAP_CLIENT_ID,
        'X-LC-Sign': lcSign,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        authData: {
          taptap: {
            openid: profile.openid,
            name: profile.name,
            avatar: profile.avatar,
            kid: token.kid,
            access_token: token.access_token,
            mac_key: token.mac_key,
            expires_in: token.expires_in ?? 0,
            platform: 'TapTap',
          },
        },
      }),
  } });
  return { sessionToken, playerId: profile.name };
}

export async function getPlayerId(sessionToken: string, signal?: AbortSignal): Promise<string> {
  return (await phigrosJson(`${LC_SERVER}/1.1/users/me`, PlayerIdResponseSchema, { signal, timeoutMs: 12_000, init: {
      headers: {
        'X-LC-Id': TAPTAP_CLIENT_ID,
        'X-LC-Key': LC_APP_KEY,
        'User-Agent': 'LeanCloud-CSharp-SDK/1.0.3',
        Accept: 'application/json',
        'X-LC-Session': sessionToken,
      },
  } })).nickname;
}

export async function getGameSave(sessionToken: string, signal?: AbortSignal): Promise<GameSaveMeta> {
  const query = new URL(`${LC_SERVER}/1.1/classes/_GameSave`);
  query.searchParams.set('order', '-updatedAt');
  query.searchParams.set('limit', '20');
  const parsed = await phigrosJson(query.toString(), GameSaveResponseSchema, { signal, timeoutMs: 12_000, init: {
      headers: {
        'X-LC-Id': TAPTAP_CLIENT_ID,
        'X-LC-Key': LC_APP_KEY,
        'User-Agent': 'LeanCloud-CSharp-SDK/1.0.3',
        Accept: 'application/json',
        'X-LC-Session': sessionToken,
        'Cache-Control': 'no-cache',
      },
      cache: 'no-store',
  } });
  return pickLatestGameSave(parsed.results);
}

export async function downloadSave(saveUrl: string, cacheBust?: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const url = new URL(saveUrl);
  url.searchParams.set('_ts', cacheBust ?? String(Date.now()));
  const bytes = await requestBytes({
    baseUrl: url.origin, path: url.pathname + url.search,
    fetcher: expoFetch as unknown as typeof fetch, signal, timeoutMs: 30_000,
    totalAttempts: 1, maxResponseBytes: Number.MAX_SAFE_INTEGER,
    init: { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } },
    label: '云存档', diagnosticScenario: 'scores',
    error: status => new ProviderError('network', `下载云存档失败（HTTP ${status}）`, status === 429 || status >= 500),
  });
  return bytes.buffer as ArrayBuffer;
}
