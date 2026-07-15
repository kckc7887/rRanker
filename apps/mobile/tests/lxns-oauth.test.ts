import { mapLxnsScore } from '@/domain/schemas';
import {
  buildAuthorizeUrl,
  createPkcePair,
  lxnsAccessTokenExpired,
} from '@/providers/lxns-oauth';
import { LXNS_OAUTH_CLIENT_ID, LXNS_OAUTH_REDIRECT_URI } from '@/providers/lxns-config';

vi.mock('expo-crypto', () => ({
  getRandomBytesAsync: async (count: number) => new Uint8Array(count).map((_, index) => index + 1),
  digestStringAsync: async () => 'abcd+/ef==',
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64', HEX: 'hex' },
}));

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => undefined),
  deleteItemAsync: vi.fn(async () => undefined),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
}));

describe('lxns oauth helpers', () => {
  it('builds authorize url with PKCE and OOB redirect', async () => {
    const { challenge } = await createPkcePair();
    const url = buildAuthorizeUrl(challenge);
    expect(url).toContain(`client_id=${LXNS_OAUTH_CLIENT_ID}`);
    expect(url).toContain(`redirect_uri=${encodeURIComponent(LXNS_OAUTH_REDIRECT_URI)}`);
    expect(url).toContain('code_challenge_method=S256');
    expect(url).toContain(`code_challenge=${encodeURIComponent(challenge)}`);
    expect(challenge).toBe('abcd-_ef');
  });

  it('detects near-expiry access tokens', () => {
    expect(lxnsAccessTokenExpired({
      mode: 'lxns-oauth',
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: Date.now() + 10_000,
      persistable: true,
    })).toBe(true);
    expect(lxnsAccessTokenExpired({
      mode: 'lxns-oauth',
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: Date.now() + 120_000,
      persistable: true,
    })).toBe(false);
  });
});

describe('mapLxnsScore', () => {
  it('maps standard/dx types and floors dx_rating', () => {
    const sd = mapLxnsScore({
      id: 834,
      song_name: 'Test',
      level: '14+',
      level_index: 3,
      achievements: 100.5,
      fc: 'app',
      fs: null,
      dx_score: 2500,
      dx_rating: 308.9,
      rate: 'sssp',
      type: 'standard',
    });
    expect(sd.type).toBe('SD');
    expect(sd.rating).toBe(308);
    expect(sd.difficulty).toBe('master');
    expect(sd.fc).toBe('app');
    expect(sd.dxScore).toBe(2500);

    const dx = mapLxnsScore({
      id: 834,
      level_index: 4,
      achievements: 99,
      type: 'utage',
      dx_score: null,
      dx_rating: 12.1,
    });
    expect(dx.type).toBe('DX');
    expect(dx.rating).toBe(12);
  });
});
