import { act, render, screen } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { ProviderLoginSheet } from '@/components/ProviderLoginSheet';
import { createOsuBoundAccount } from '@/domain/bound-account';
import { findGame } from '@/domain/game-bind-options';

const mockOsuAccount = createOsuBoundAccount({
  gameId: 'osu-standard',
  userId: 1,
  displayName: '已有osu玩家',
  pp: 1234,
});
const mockOsuSession = {
  mode: 'osu-oauth',
  accessToken: 'access',
  refreshToken: 'refresh',
  expiresAt: Date.now() + 60_000,
  persistable: true,
} as const;

let oauthListener: ((outcome: unknown) => void) | null = null;

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/theme/app-theme', () => ({
  useAppTheme: () => ({
    background: '#fff',
    surface: '#fff',
    surfaceMuted: '#f5f5f5',
    input: '#fff',
    border: '#ddd',
    text: '#111',
    textSecondary: '#444',
    textMuted: '#777',
    accent: '#246BFD',
  }),
}));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('@/storage/secure-session-store', () => ({
  SecureSessionStore: jest.fn(() => ({ upsertAccount: jest.fn() })),
}));
jest.mock('@/storage/chunithm-temp-account-store', () => ({
  ChunithmTempAccountStore: jest.fn(() => ({ remove: jest.fn(async () => undefined) })),
}));
jest.mock('@/state/query-client', () => ({
  queryClient: { invalidateQueries: jest.fn() },
}));
jest.mock('@/state/session-store', () => ({
  useSession: (selector: (state: Record<string, unknown>) => unknown) => selector({
    boundAccounts: [mockOsuAccount],
    sessionsByAccountId: { [mockOsuAccount.id]: mockOsuSession },
    credentialIdsByAccountId: { [mockOsuAccount.id]: 'osu:shared' },
    setSession: jest.fn(),
    setOsuBinding: jest.fn(),
    removeBoundAccount: jest.fn(),
  }),
}));
jest.mock('@/providers/osu-oauth', () => ({
  beginOsuAuthorize: jest.fn(async () => 'https://osu.ppy.sh/oauth/authorize?state=x'),
  subscribeOsuOAuthOutcome: (listener: (outcome: unknown) => void) => {
    oauthListener = listener;
    return () => { oauthListener = null; };
  },
}));
jest.mock('@/services/osu-account-binding', () => ({
  bindOsuModes: jest.fn(),
}));

describe('ProviderLoginSheet osu! OAuth', () => {
  it('回调页进入模式选择时自动关闭绑定页（awaiting-mode-selection）', async () => {
    const onSuccess = jest.fn();
    const provider = findGame('osu-standard')?.providers[0] ?? null;
    await act(async () => {
      render(
        <ProviderLoginSheet
          visible
          provider={provider}
          gameId="osu-standard"
          gameTitle="osu!standard"
          onClose={() => undefined}
          onSuccess={onSuccess}
        />,
      );
    });

    expect(screen.getByText('前往 osu! 授权')).toBeTruthy();
    expect(screen.getByLabelText('使用已有osu账号')).toBeTruthy();

    await act(async () => { oauthListener?.({ status: 'awaiting-mode-selection' }); });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });
});
