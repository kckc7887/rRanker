import { describe, expect, it, vi } from 'vitest';
import { bindOsuModes } from '@/services/osu-account-binding';
import { createOsuBoundAccount } from '@/domain/bound-account';
import { ProviderError } from '@/providers/errors';

const mocks = vi.hoisted(() => ({
  getOwnUser: vi.fn(),
  getUser: vi.fn(),
  getSession: vi.fn(),
  upsertAccount: vi.fn(),
}));

vi.mock('@/providers/osu-score-provider', () => ({
  OsuScoreProvider: vi.fn(function OsuScoreProviderMock() {
    return {
      getOwnUser: mocks.getOwnUser,
      getUser: mocks.getUser,
      getSession: mocks.getSession,
    };
  }),
}));

vi.mock('@/storage/secure-session-store', () => ({
  SecureSessionStore: vi.fn(function SecureSessionStoreMock() {
    return {
      upsertAccount: mocks.upsertAccount,
    };
  }),
}));

const session = {
  mode: 'osu-oauth',
  accessToken: 'access',
  refreshToken: 'refresh',
  expiresAt: Date.now() + 3_600_000,
  persistable: true,
} as const;

function userResponse(pp = 1234.5) {
  return {
    id: 2,
    username: 'peppy',
    avatar_url: 'https://a.ppy.sh/2.png',
    statistics: { pp, accuracy: 0.96, play_time: 100, play_count: 10, global_rank: 1000 },
  };
}

describe('osu! 模式绑定', () => {
  it('只创建选中模式账号并共享同一 credentialId', async () => {
    mocks.getOwnUser.mockResolvedValue(userResponse());
    mocks.getUser.mockResolvedValue(userResponse());
    mocks.getSession.mockReturnValue(session);
    mocks.upsertAccount.mockResolvedValue(undefined);

    const result = await bindOsuModes({
      modeGameIds: ['osu-standard', 'osu-mania'],
      session,
      existingAccounts: [],
      credentialIdsByAccountId: {},
    });

    expect(result.accounts.map((account) => account.gameId)).toEqual(['osu-standard', 'osu-mania']);
    expect(result.activeAccountId).toBe('osu-standard:osu:2');
    expect(result.credentialId.startsWith('osu:')).toBe(true);
    expect(mocks.upsertAccount).toHaveBeenCalledTimes(2);
    for (const call of mocks.upsertAccount.mock.calls) {
      expect(call[0].providerId).toBe('osu');
      expect(call[0].credentialId).toBe(result.credentialId);
      expect(call[0].scoreDisplay).toBe('1235');
    }
  });

  it('空选择报鉴权错误', async () => {
    await expect(bindOsuModes({
      modeGameIds: [],
      session,
      existingAccounts: [],
      credentialIdsByAccountId: {},
    })).rejects.toMatchObject({ code: 'authentication' } as Partial<ProviderError>);
  });

  it('重复模式去重', async () => {
    mocks.getOwnUser.mockResolvedValue(userResponse());
    mocks.getUser.mockResolvedValue(userResponse());
    mocks.getSession.mockReturnValue(session);
    const result = await bindOsuModes({
      modeGameIds: ['osu-standard', 'osu-standard', 'osu-mania'],
      session,
      existingAccounts: [],
      credentialIdsByAccountId: {},
    });
    expect(result.accounts).toHaveLength(2);
  });

  it('同 osu 用户重复授权复用既有 credentialId（合并而非新建）', async () => {
    mocks.getOwnUser.mockResolvedValue(userResponse());
    mocks.getUser.mockResolvedValue(userResponse());
    mocks.getSession.mockReturnValue(session);
    const existing = createOsuBoundAccount({
      gameId: 'osu-standard',
      userId: 2,
      displayName: 'peppy',
      pp: 1000,
    });
    const result = await bindOsuModes({
      modeGameIds: ['osu-mania'],
      session,
      existingAccounts: [existing],
      credentialIdsByAccountId: { [existing.id]: 'osu:existing' },
    });
    expect(result.credentialId).toBe('osu:existing');
    expect(result.accounts[0].gameId).toBe('osu-mania');
  });

  it('非 OAuth 会话抛类型错误', async () => {
    await expect(bindOsuModes({
      modeGameIds: ['osu-standard'],
      session: { mode: 'jwt', value: 'x', persistable: true } as const,
      existingAccounts: [],
      credentialIdsByAccountId: {},
    })).rejects.toThrow(TypeError);
  });
});
