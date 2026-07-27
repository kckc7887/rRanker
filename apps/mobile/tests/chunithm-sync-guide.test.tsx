import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import {
  CHUNITHM_OFFLINE_SYNC_URL,
  CHUNITHM_PROXY_ADDRESS,
  CHUNITHM_PROXY_PORT,
  CHUNITHM_PROXY_SERVER,
  ChunithmSyncGuideSheet,
} from '@/components/chunithm/ChunithmSyncGuideSheet';

const mockSetStringAsync = jest.fn(async (_value: string) => undefined);
const mockShowNotification = jest.fn();
let mockMaintenance = false;

jest.mock('expo-clipboard', () => ({
  setStringAsync: (value: string) => mockSetStringAsync(value),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, right: 0, bottom: 34, left: 0 }),
}));
jest.mock('@/components/AppModal', () => ({
  AppModal: ({
    visible,
    children,
    presentationStyle,
  }: {
    visible?: boolean;
    children: ReactNode;
    presentationStyle?: string;
  }) => {
    const RN = jest.requireActual<typeof import('react-native')>('react-native');
    return visible ? (
      <RN.View accessibilityLabel={presentationStyle} testID="mock-app-modal">
        {children}
      </RN.View>
    ) : null;
  },
}));
jest.mock('@/components/AppNotification', () => ({
  useNotification: () => ({ showNotification: mockShowNotification }),
}));
jest.mock('@/domain/chunithm-maintenance', () => ({
  CHUNITHM_MAINTENANCE_MESSAGE: '维护窗口说明',
  isChunithmMaintenanceWindow: () => mockMaintenance,
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
    overlay: 'rgba(17,24,39,0.58)',
  }),
}));

describe('Chunithm sync guide', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMaintenance = false;
  });

  it('uses the same native page sheet structure as account login without a top safe-area spacer', async () => {
    const screen = await render(
      <ChunithmSyncGuideSheet
        visible
        syncing={false}
        onClose={jest.fn()}
        onSync={jest.fn(async () => false)}
      />,
    );

    expect(screen.getByTestId('mock-app-modal').props.accessibilityLabel).toBe('pageSheet');
    expect(StyleSheet.flatten(screen.getByTestId('chunithm-sync-guide-root').props.style))
      .toEqual(expect.objectContaining({
        flex: 1,
        backgroundColor: '#F7F8FA',
        paddingBottom: 34,
      }));
    expect(StyleSheet.flatten(screen.getByTestId('chunithm-sync-guide-root').props.style))
      .not.toHaveProperty('paddingTop');
    expect(screen.queryByLabelText('关闭中二同步引导背景')).toBeNull();
  });

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

  it('blocks guide copy actions during maintenance but does not replace the sync action', async () => {
    mockMaintenance = true;
    const onSync = jest.fn(async () => false);
    const screen = await render(
      <ChunithmSyncGuideSheet
        visible
        syncing={false}
        onClose={jest.fn()}
        onSync={onSync}
      />,
    );

    await fireEvent.press(screen.getByLabelText('复制服务器'));
    expect(mockSetStringAsync).not.toHaveBeenCalled();
    expect(mockShowNotification).toHaveBeenCalledWith({
      title: '游戏服务器维护中',
      message: '维护窗口说明',
      variant: 'warning',
    });

    await fireEvent.press(screen.getByLabelText('从同步引导同步中二数据'));
    await waitFor(() => expect(onSync).toHaveBeenCalledTimes(1));
  });
});
