import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { Linking } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { LxnsLoginPanel } from '@/components/LxnsLoginPanel';
import { OsuLoginPanel } from '@/components/osu/OsuLoginPanel';
import { createAppTheme } from '@/theme/theme-tokens';

jest.mock('@/state/app-lifecycle', () => ({ useAppLifecycle: () => ({ foregroundReady: true, foregroundGeneration: 1 }) }));
const mockTheme = createAppTheme('light', '#246BFD');
jest.mock('@/theme/app-theme', () => ({ useAppTheme: () => mockTheme }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
jest.mock('@/state/query-client', () => ({ queryClient: { invalidateQueries: jest.fn() } }));
jest.mock('@/storage/chunithm-temp-account-store', () => ({ ChunithmTempAccountStore: jest.fn(() => ({ remove: jest.fn() })) }));
jest.mock('@/services/lxns-account-binding', () => ({ bindLxnsAccount: jest.fn() }));
jest.mock('@/services/osu-account-binding', () => ({ bindOsuModes: jest.fn() }));
jest.mock('@/state/session-store', () => ({
  useSession: (select: (state: unknown) => unknown) => select({
    boundAccounts: [], sessionsByAccountId: {}, credentialIdsByAccountId: {},
    setSession: jest.fn(), setOsuBinding: jest.fn(), removeBoundAccount: jest.fn(),
  }),
}));

const providers = [
  { label: '落雪', button: '前往落雪授权', panel: (onSuccess: () => void) => <LxnsLoginPanel visible gameId="maimai" gameTitle="舞萌 DX" onBusyChange={() => undefined} onSuccess={onSuccess} /> },
  { label: 'osu!', button: '前往 osu! 授权', panel: (onSuccess: () => void) => <OsuLoginPanel visible onBusyChange={() => undefined} onSuccess={onSuccess} /> },
];

beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.restoreAllMocks());

describe.each(providers)('$label 授权失败阶段', ({ button, panel }) => {
  it('真实随机数生成失败在准备阶段提示且不打开浏览器', async () => {
    jest.spyOn(Crypto, 'getRandomBytesAsync').mockRejectedValueOnce(new Error('private native crypto error'));
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const success = jest.fn();
    await render(panel(success)); await fireEvent.press(screen.getByText(button));
    await waitFor(() => expect(screen.getByText('无法准备授权，请重试；若仍失败，请查看诊断。')).toBeTruthy());
    expect(open).not.toHaveBeenCalled(); expect(success).not.toHaveBeenCalled();
    expect(screen.queryByText(/private native/u)).toBeNull();
  });

  it('真实 SecureStore pending 写入失败保留准备阶段且不打开浏览器', async () => {
    jest.spyOn(SecureStore, 'setItemAsync').mockRejectedValueOnce(new Error('native secure write failed'));
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const success = jest.fn();
    await render(panel(success)); await fireEvent.press(screen.getByText(button));
    await waitFor(() => expect(screen.getByText('无法准备授权，请重试；若仍失败，请查看诊断。')).toBeTruthy());
    expect(open).not.toHaveBeenCalled(); expect(success).not.toHaveBeenCalled();
  });

  it('真实浏览器打开拒绝单独提示打开阶段', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValueOnce(new Error('native activity failure secret'));
    const success = jest.fn();
    await render(panel(success)); await fireEvent.press(screen.getByText(button));
    await waitFor(() => expect(screen.getByText('无法打开授权页面，请检查浏览器后重试。')).toBeTruthy());
    expect(success).not.toHaveBeenCalled();
    expect(screen.queryByText(/native activity/u)).toBeNull();
  });
});
