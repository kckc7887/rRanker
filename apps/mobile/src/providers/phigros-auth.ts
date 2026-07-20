import { z } from 'zod';
import CryptoJS from 'crypto-js';

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

async function postForm(url: string, body: Record<string, string>): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const form = new URLSearchParams(body);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: controller.signal,
    });
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function requestDeviceCode(): Promise<DeviceCodeResult> {
  const deviceId = randStr(32);
  const raw = await postForm('https://accounts.tapapis.cn/oauth2/v1/device/code', {
    client_id: TAPTAP_CLIENT_ID,
    response_type: 'device_code',
    scope: TAPTAP_SCOPE,
    platform: 'unity',
    info: JSON.stringify({ device_id: deviceId }),
  });

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
): Promise<TapTapToken | 'pending' | 'waiting'> {
  const raw = await postForm('https://accounts.tapapis.cn/oauth2/v1/token', {
    grant_type: 'device_token',
    client_id: TAPTAP_CLIENT_ID,
    code: deviceCode,
    info: JSON.stringify({ device_id: deviceId }),
  });

  const success = TokenResponseSchema.safeParse(raw);
  if (success.success) return success.data.data;

  const err = TokenErrorSchema.safeParse(raw);
  const error = err.success ? err.data.data?.error ?? err.data.error_description : 'unknown';
  if (error === 'authorization_pending') return 'pending';
  if (error === 'authorization_waiting') return 'waiting';
  throw new Error(error ?? 'TapTap 登录失败');
}

async function getProfile(token: TapTapToken): Promise<z.infer<typeof ProfileDataSchema>> {
  const url = `https://open.tapapis.cn/account/profile/v1?client_id=${TAPTAP_CLIENT_ID}`;
  const parsed = new URL(url);
  const method = 'GET';
  const ts = String(Math.floor(Date.now() / 1000)).padStart(10, '0');
  const nonce = randStr(16);
  const uri = parsed.pathname + parsed.search;
  const host = parsed.hostname;
  const port = '443';
  const sigBase = `${ts}\n${nonce}\n${method}\n${uri}\n${host}\n${port}\n\n`;

  const mac = CryptoJS.enc.Base64.stringify(
    CryptoJS.HmacSHA1(sigBase, token.mac_key),
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `MAC id="${token.kid}", ts="${ts}", nonce="${nonce}", mac="${mac}"` },
      signal: controller.signal,
    });
    const json = await res.json();
    return ProfileResponseSchema.parse(json).data;
  } finally {
    clearTimeout(timeout);
  }
}

export async function exchangeSessionToken(token: TapTapToken): Promise<PhigrosSession> {
  const profile = await getProfile(token);
  const ts = String(Math.floor(Date.now() / 1000));

  const lcHash = CryptoJS.MD5(ts + LC_APP_KEY).toString();
  const lcSign = `${lcHash},${ts}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`${LC_SERVER}/1.1/users`, {
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
      signal: controller.signal,
    });
    const json = await res.json();
    const { sessionToken } = SessionTokenResponseSchema.parse(json);
    return { sessionToken, playerId: profile.name };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getPlayerId(sessionToken: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(`${LC_SERVER}/1.1/users/me`, {
      headers: {
        'X-LC-Id': TAPTAP_CLIENT_ID,
        'X-LC-Key': LC_APP_KEY,
        'User-Agent': 'LeanCloud-CSharp-SDK/1.0.3',
        Accept: 'application/json',
        'X-LC-Session': sessionToken,
      },
      signal: controller.signal,
    });
    const json = await res.json();
    return PlayerIdResponseSchema.parse(json).nickname;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getGameSave(sessionToken: string): Promise<{
  summaryBase64: string;
  saveUrl: string;
  updatedAt: string;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(`${LC_SERVER}/1.1/classes/_GameSave`, {
      headers: {
        'X-LC-Id': TAPTAP_CLIENT_ID,
        'X-LC-Key': LC_APP_KEY,
        'User-Agent': 'LeanCloud-CSharp-SDK/1.0.3',
        Accept: 'application/json',
        'X-LC-Session': sessionToken,
      },
      signal: controller.signal,
    });
    const json = await res.json();
    const parsed = GameSaveResponseSchema.parse(json);
    const save = parsed.results[0];
    return {
      summaryBase64: save.summary,
      saveUrl: save.gameFile.url,
      updatedAt: save.updatedAt,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function downloadSave(saveUrl: string): Promise<ArrayBuffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(saveUrl, { signal: controller.signal });
    return await res.arrayBuffer();
  } finally {
    clearTimeout(timeout);
  }
}
