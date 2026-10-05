import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { ProviderLoginSheet } from '@/components/ProviderLoginSheet';
import { createOsuBoundAccount } from '@/domain/bound-account';
import { findGame } from '@/domain/game-bind-options';
import { OsuLoginPanel } from '@/components/osu/OsuLoginPanel';
import { bindOsuModes } from '@/services/osu-account-binding';
import type { AppLifecycleSnapshot } from '@/state/app-lifecycle';

let mockLifecycle: AppLifecycleSnapshot = { appState: 'active', phase: 'foreground-ready', foregroundReady: true,
  foregroundGeneration: 1, memoryWarningGeneration: 0 };
const mockSetOsuBinding = jest.fn();
jest.mock('@/state/app-lifecycle', () => ({ useAppLifecycle: () => mockLifecycle }));
jest.mock('@/components/osu/OsuModeSelectSheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return { OsuModeSelectSheet: ({ visible, onSubmit }: { visible: boolean; onSubmit: (ids: string[]) => void }) =>
    visible ? React.createElement(RN.Pressable, { accessibilityLabel: '确认复用模式',
      onPress: () => onSubmit(['osu-mania']) }) : null };
});

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
    setOsuBinding: mockSetOsuBinding,
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
  beforeEach(() => {
    jest.clearAllMocks();
    mockLifecycle = { appState: 'active', phase: 'foreground-ready', foregroundReady: true,
      foregroundGeneration: 1, memoryWarningGeneration: 0 };
  });

  it.each(['hide', 'background'])('prevents a late reused binding after %s', async transition => {
    let release!: (value: Awaited<ReturnType<typeof bindOsuModes>>) => void;
    jest.mocked(bindOsuModes).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const success = jest.fn();
    const panel = (visible: boolean) => <OsuLoginPanel visible={visible} onSuccess={success} onBusyChange={jest.fn()} />;
    const view = await render(panel(true));
    await fireEvent.press(view.getByLabelText('使用已有osu账号'));
    await fireEvent.press(view.getByLabelText('使用已有osu账号 已有osu玩家'));
    await fireEvent.press(view.getByLabelText('确认复用模式'));
    await waitFor(() => expect(bindOsuModes).toHaveBeenCalledTimes(1));
    const signal = jest.mocked(bindOsuModes).mock.calls[0]![0].signal!;
    if (transition === 'background') mockLifecycle = { ...mockLifecycle, phase: 'background', appState: 'background', foregroundReady: false };
    await view.rerender(panel(transition !== 'hide'));
    expect(signal.aborted).toBe(true);
    await act(async () => { release({ accounts: [mockOsuAccount], activeAccountId: mockOsuAccount.id,
      credentialId: 'osu:shared', session: mockOsuSession }); });
    expect(mockSetOsuBinding).not.toHaveBeenCalled(); expect(success).not.toHaveBeenCalled();
  });

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
