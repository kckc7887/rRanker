/**
 * Protocol/key adaptation from CHCAT1320/RizlineGameSaveData, GPL v3 text,
 * ba89227baa2927655ea884a849d6a27ea1cdfb2d. Upstream README statements are retained
 * in THIRD_PARTY_NOTICES.md; full license: LICENSES/RizlineGameSaveData-GPL-3.0.txt.
 * Modified by rRanker, 2026-09-14: typed HTTP/SMS login, token rotation, cancellation
 * and authenticated save parsing. AES-GCM itself uses unmodified @noble/ciphers (MIT).
 */
import { gcm } from '@noble/ciphers/aes.js';
import { fetch as expoFetch } from 'expo/fetch';
import { z } from 'zod';
import { RIZLINE_DIFFICULTIES, type RizlineSave } from '@/domain/rizline';
import { getRizlineDeviceId } from '@/storage/rizline-device-store';
import { base64ToBytes } from '@/utils/crypto-subset';
import type { RizlineSession } from './contracts';
import { ProviderError, providerErrorFromStatus } from './errors';
import { requestProviderResponse, retryAfterMs } from './http-json';

const BASE_URL = 'https://rizserver.pigeongames.net';
const GAME_ID = 'pigeongames.rizline';
const PhoneSchema = z.string().regex(/^1\d{10}$/u);
const CodeSchema = z.string().regex(/^\d{4,8}$/u);
const DifficultySchema = z.enum(RIZLINE_DIFFICULTIES);
export const RizlineSaveSchema: z.ZodType<RizlineSave> = z.object({
  userId: z.string().min(1), username: z.string(), totalRks: z.number().nonnegative(),
  myBest: z.array(z.object({
    trackAssetId: z.string().min(1), difficultyClassName: DifficultySchema,
    score: z.number().int().nonnegative(), completeRate: z.number().nonnegative(),
    isFullCombo: z.boolean().optional(), isClear: z.boolean().optional(),
  })),
  levelsRks: z.array(z.object({
    trackId: z.string().min(1), difficultyClassName: DifficultySchema, rks: z.number().nonnegative(),
  })),
});
const AccountResponseSchema = z.object({ code: z.number().int() });
const TokenClaimsSchema = z.object({
  userId: z.string().min(1), phone: PhoneSchema, gameId: z.literal(GAME_ID),
  channelId: z.union([z.string(), z.number().int()]).transform(String).pipe(z.enum(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'])),
});

// https://github.com/CHCAT1320/RizlineGameSaveData/blob/ba89227baa2927655ea884a849d6a27ea1cdfb2d/gameDataAes2Json.py
function saveKey(): Uint8Array {
  const packed = Uint8Array.from('9693ad9f6e7e7034350c223affd2a0b57b6c76572e511b1c93a0d230c09aede7'.match(/../gu)!, pair => parseInt(pair, 16));
  const key = new Uint8Array(32);
  [5, 2, 7, 0, 6, 3, 1, 4].forEach((position, index) => key.set(packed.subarray(index * 4, index * 4 + 4), position * 4));
  for (let i = 0; i < key.length; i++) key[i] ^= (0xa7 + 13 * i + 7 * (i >> 2)) & 0xff;
  return key;
}

export function decryptRizlineSave(body: Uint8Array): RizlineSave {
  try {
    let encrypted = body;
    if (body.length >= 40 && body.every(byte => byte <= 127)) {
      const text = new TextDecoder().decode(body).trim();
      if (/^[A-Za-z0-9+/=\s]+$/u.test(text)) encrypted = base64ToBytes(text);
    }
    if (encrypted.length < 28) throw new Error('Invalid encrypted save');
    const plaintext = gcm(saveKey(), encrypted.subarray(0, 12)).decrypt(encrypted.subarray(12));
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext));
    return RizlineSaveSchema.parse(value);
  } catch {
    throw new ProviderError('upstream_schema', '无法读取 Rizline 存档，请稍后重试', false);
  }
}

function tokenClaims(token: string) {
  try {
    if (token.length > 8192 || /[\r\n]/u.test(token)) throw new Error('Invalid credential');
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) throw new Error('Invalid credential');
    const bytes = base64ToBytes(parts[1].replace(/-/gu, '+').replace(/_/gu, '/'));
    return TokenClaimsSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  } catch {
    throw new ProviderError('authentication', '登录信息无效，请重新登录', false);
  }
}

function requirePhone(phone: string): string {
  const parsed = PhoneSchema.safeParse(phone.trim());
  if (!parsed.success) throw new ProviderError('authentication', '请输入正确的手机号', false);
  return parsed.data;
}

export class RizlineProvider {
  private session?: RizlineSession;
  private readonly fetcher: typeof fetch;
  constructor(private readonly options: {
    session?: RizlineSession;
    onSessionChanged?: (session: RizlineSession) => Promise<void>;
    fetcher?: typeof fetch;
  } = {}) {
    this.session = options.session;
    this.fetcher = options.fetcher ?? expoFetch as unknown as typeof fetch;
  }

  private async post(path: string, body: Record<string, string>, phone: string, signal?: AbortSignal) {
    const deviceId = this.session?.deviceId ?? await getRizlineDeviceId();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json', game_id: GAME_ID, device_id: deviceId,
      channel_id: path === '/game/rn_login' ? this.session?.channelId ?? '1' : '1', i18n: 'zh-CN', phone,
    };
    if (this.session && path === '/game/rn_login') headers.token = this.session.token;
    let token: string | null = null;
    let retryAfterSeconds: number | undefined;
    const bytes = await requestProviderResponse({
      baseUrl: BASE_URL, path, schema: z.instanceof(Uint8Array), fetcher: this.fetcher,
      label: 'Rizline', signal, retries: 1, timeoutMs: 20_000,
      init: { method: 'POST', headers, body: JSON.stringify(body), credentials: 'omit', redirect: 'error' },
      error: status => {
        const error = providerErrorFromStatus(status, {
        authentication: '登录已失效或验证码不正确', permission: '当前账号无法读取成绩',
        rateLimit: '操作太频繁，请稍后再试', server: 'Rizline 暂时无法连接',
        fallback: { message: () => 'Rizline 请求失败' },
        });
        return new ProviderError(error.code, error.message, false, { retryAfterSeconds });
      },
      onResponse: response => {
        token = response.headers.get('set_token') ?? response.headers.get('set-token');
        if (response.headers.has('Retry-After')) retryAfterSeconds = Math.ceil(retryAfterMs(response, Infinity) / 1000);
      },
    }, async response => {
      const value = new Uint8Array(await response.arrayBuffer());
      if (value.length > 16 * 1024 * 1024) throw new ProviderError('upstream_schema', 'Rizline 数据暂时无法读取', false);
      return value;
    });
    return { bytes, token: token as string | null, deviceId, retryAfterSeconds };
  }

  async sendVerificationCode(phone: string, signal?: AbortSignal): Promise<{ retryAfterSeconds: number; confirmed: boolean }> {
    const normalized = requirePhone(phone);
    const { bytes, retryAfterSeconds } = await this.post('/account/send_verify_code', { phone: normalized, transaction: 'login' }, normalized, signal);
    const text = new TextDecoder().decode(bytes).trim();
    const cooldown = Math.max(60, retryAfterSeconds ?? 60);
    if (!text) return { retryAfterSeconds: cooldown, confirmed: false };
    let value: unknown;
    try { value = JSON.parse(text); } catch { throw new ProviderError('upstream_schema', '验证码发送结果暂时无法确认', false, { retryAfterSeconds: cooldown }); }
    const parsed = AccountResponseSchema.safeParse(value);
    if (!parsed.success) throw new ProviderError('upstream_schema', '验证码发送结果暂时无法确认', false, { retryAfterSeconds: cooldown });
    if (parsed.data.code !== 0) throw new ProviderError('authentication', '验证码发送失败，请稍后重试', false, { retryAfterSeconds: cooldown });
    return { retryAfterSeconds: cooldown, confirmed: true };
  }

  async login(phone: string, code: string, signal?: AbortSignal) {
    const normalized = requirePhone(phone);
    if (!CodeSchema.safeParse(code.trim()).success) throw new ProviderError('authentication', '请输入正确的验证码', false);
    const result = await this.post('/account/login', { phone: normalized, code: code.trim() }, normalized, signal);
    let value: unknown;
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(result.bytes)); }
    catch { throw new ProviderError('upstream_schema', '登录结果暂时无法读取', false); }
    const parsed = AccountResponseSchema.safeParse(value);
    if (!parsed.success) throw new ProviderError('upstream_schema', '登录结果暂时无法读取', false);
    if (parsed.data.code !== 0 || !result.token) throw new ProviderError('authentication', '验证码不正确或已过期', false);
    const claims = tokenClaims(result.token);
    if (claims.phone !== normalized) throw new ProviderError('authentication', '登录账号不一致，请重新登录', false);
    const previous = this.session;
    this.session = { mode: 'rizline', token: result.token, phone: normalized, deviceId: result.deviceId,
      channelId: claims.channelId, persistable: true };
    try {
      const save = await this.getSave(signal);
      if (signal?.aborted) throw signal.reason;
      return { session: this.session, save, player: { userId: save.userId, username: save.username, totalRks: save.totalRks } };
    } catch (error) { this.session = previous; throw error; }
  }

  async getSave(signal?: AbortSignal): Promise<RizlineSave> {
    const current = this.session;
    if (!current) throw new ProviderError('authentication', '请先登录 Rizline 账号', false);
    const claims = tokenClaims(current.token);
    if (claims.phone !== current.phone) throw new ProviderError('authentication', '登录账号不一致，请重新登录', false);
    const { bytes, token } = await this.post('/game/rn_login', {}, current.phone, signal);
    const save = decryptRizlineSave(bytes);
    if (signal?.aborted) throw signal.reason;
    if (save.userId !== claims.userId) throw new ProviderError('authentication', '读取到的账号不一致，请重新登录', false);
    if (token && token !== current.token) {
      const rotated = tokenClaims(token);
      if (rotated.userId !== save.userId || rotated.phone !== current.phone) {
        throw new ProviderError('authentication', '登录账号不一致，请重新登录', false);
      }
      const next: RizlineSession = { ...current, token, channelId: rotated.channelId };
      await this.options.onSessionChanged?.(next);
      if (signal?.aborted) throw signal.reason;
      this.session = next;
    }
    return save;
  }
}
