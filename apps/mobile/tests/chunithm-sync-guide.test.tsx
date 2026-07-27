import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import {
  CHUNITHM_OFFLINE_SYNC_URL,
  CHUNITHM_PROXY_ADDRESS,
  CHUNITHM_PROXY_PORT,
  CHUNITHM_PROXY_SERVER,
  ChunithmSyncGuideSheet,
} from '@/components/chunithm/ChunithmSyncGuideSheet';

const mockSetStringAsync = jest.fn(async (_value: string) => undefined);
const mockShowNotification = jest.fn();

jest.mock('expo-clipboard', () => ({
  setStringAsync: (value: string) => mockSetStringAsync(value),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/components/AppModal', () => ({
  AppModal: ({ visible, children }: { visible?: boolean; children: unknown }) => (
    visible ? children : null
  ),
}));
jest.mock('@/components/AppNotification', () => ({
  useNotification: () => ({ showNotification: mockShowNotification }),
}));
jest.mock('@/theme/app-theme', () => ({
  useAppTheme: () => ({
    accent: '#246BFD',
    background: '#F7F8FA',
    surface: '#FFFFFF',
    surfaceMuted: '#EEF2F7',
    input: '#FFFFFF',
    border: '#D1D5DB',
    text: '#111827',
    textSecondary: '#4B5563',
    textMuted: '#6B7280',
    warning: '#B45309',
  }),
}));

describe('Chunithm sync guide', () => {
  beforeEach(() => jest.clearAllMocks());

  it('copies all proxy forms and the offline WeChat link without a direct-open action', async () => {
    const screen = await render(
      <ChunithmSyncGuideSheet
        visible
        syncing={false}
        onClose={jest.fn()}
        onSync={jest.fn(async () => false)}
      />,
    );

    await fireEvent.press(screen.getByLabelText('复制服务器'));
    await fireEvent.press(screen.getByLabelText('复制端口'));
    await fireEvent.press(screen.getByLabelText('复制完整地址'));
    await fireEvent.press(screen.getByLabelText('复制中二离线同步链接'));

    expect(mockSetStringAsync.mock.calls.map(([value]) => value)).toEqual([
      CHUNITHM_PROXY_SERVER,
      CHUNITHM_PROXY_PORT,
      CHUNITHM_PROXY_ADDRESS,
      CHUNITHM_OFFLINE_SYNC_URL,
    ]);
    expect(screen.getByText(/不要把链接粘贴到搜索框/)).toBeTruthy();
    expect(screen.queryByLabelText(/打开.*链接/)).toBeNull();
    expect(mockShowNotification).toHaveBeenCalledTimes(4);
  });

  it('keeps the guide open on stale or empty refresh and closes only on fresh data', async () => {
    const onClose = jest.fn();
    const onSync = jest.fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const screen = await render(
      <ChunithmSyncGuideSheet
        visible
        syncing={false}
        onClose={onClose}
        onSync={onSync}
      />,
    );

    await fireEvent.press(screen.getByLabelText('从同步引导同步中二数据'));
    await waitFor(() => expect(onSync).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByLabelText('从同步引导同步中二数据'));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
