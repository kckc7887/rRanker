import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import {
  MAIMAI_OFFLINE_SYNC_URL,
  MAIMAI_PROXY_ADDRESS,
  MAIMAI_PROXY_PORT,
  MAIMAI_PROXY_SERVER,
  MaimaiSyncGuideContent,
  MaimaiSyncGuideSheet,
} from '@/components/maimai/MaimaiSyncGuideSheet';
import {
  createLocalMaimaiAccount,
  createMaimaiBoundAccount,
} from '@/domain/bound-account';

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
jest.mock('@/components/BoundAccountAvatar', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return { BoundAccountAvatar: () => <RN.View testID="mock-account-avatar" /> };
});
jest.mock('@/domain/maimai-maintenance', () => ({
  MAIMAI_MAINTENANCE_MESSAGE: '舞萌维护窗口说明',
  isMaimaiMaintenanceWindow: () => mockMaintenance,
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

describe('Maimai sync guide', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMaintenance = false;
  });

  it('uses an independent native page sheet without a top safe-area spacer', async () => {
    const screen = await render(
      <MaimaiSyncGuideSheet
        visible
        syncing={false}
        onClose={jest.fn()}
        onSync={jest.fn(async () => false)}
      />,
    );

    expect(screen.getByTestId('mock-app-modal').props.accessibilityLabel).toBe('pageSheet');
    expect(StyleSheet.flatten(screen.getByTestId('maimai-sync-guide-root').props.style))
      .toEqual(expect.objectContaining({
        flex: 1,
        backgroundColor: '#F7F8FA',
        paddingBottom: 34,
      }));
    expect(screen.getByText('上传舞萌数据')).toBeTruthy();
    expect(screen.getByText(/离线同步仅更新已经与落雪账号绑定/)).toBeTruthy();
  });

  it('copies all proxy forms and the verified maimai offline WeChat link', async () => {
    const screen = await render(
      <MaimaiSyncGuideSheet
        visible
        syncing={false}
        onClose={jest.fn()}
        onSync={jest.fn(async () => false)}
      />,
    );

    await fireEvent.press(screen.getByLabelText('复制服务器'));
    await fireEvent.press(screen.getByLabelText('复制端口'));
    await fireEvent.press(screen.getByLabelText('复制完整地址'));
    await fireEvent.press(screen.getByLabelText('复制舞萌离线同步链接'));

    expect(mockSetStringAsync.mock.calls.map(([value]) => value)).toEqual([
      MAIMAI_PROXY_SERVER,
      MAIMAI_PROXY_PORT,
      MAIMAI_PROXY_ADDRESS,
      MAIMAI_OFFLINE_SYNC_URL,
    ]);
    expect(MAIMAI_OFFLINE_SYNC_URL).toBe('https://maimai.lxns.net/api/v0/maimai/wechat/auth');
    expect(screen.queryByLabelText(/打开.*链接/)).toBeNull();
  });

  it('keeps the guide open until app data refresh succeeds', async () => {
    const onClose = jest.fn();
    const onSync = jest.fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const screen = await render(
      <MaimaiSyncGuideSheet
        visible
        syncing={false}
        onClose={onClose}
        onSync={onSync}
      />,
    );

    await fireEvent.press(screen.getByLabelText('从同步引导同步舞萌数据'));
    await waitFor(() => expect(onSync).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByLabelText('从同步引导同步舞萌数据'));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('blocks copy actions during the maimai maintenance window', async () => {
    mockMaintenance = true;
    const screen = await render(
      <MaimaiSyncGuideSheet
        visible
        syncing={false}
        onClose={jest.fn()}
        onSync={jest.fn(async () => false)}
      />,
    );

    await fireEvent.press(screen.getByLabelText('复制舞萌离线同步链接'));
    expect(mockSetStringAsync).not.toHaveBeenCalled();
    expect(mockShowNotification).toHaveBeenCalledWith({
      title: '游戏服务器维护中',
      message: '舞萌维护窗口说明',
      variant: 'warning',
    });
  });

  it('selects an LXNS source from an expandable list and checks upload targets', async () => {
    const sourceA = createMaimaiBoundAccount({
      providerId: 'lxns',
      displayName: '落雪甲',
      rating: 15000,
      playerId: 'source-a',
    });
    const sourceB = createMaimaiBoundAccount({
      providerId: 'lxns',
      displayName: '落雪乙',
      rating: 14500,
      playerId: 'source-b',
    });
    const local = createLocalMaimaiAccount('本地目标', 0);
    const onSelectSource = jest.fn();
    const onToggleTarget = jest.fn();
    const screen = await render(
      <MaimaiSyncGuideContent
        syncing={false}
        sourceAccounts={[sourceA, sourceB]}
        targets={[
          { account: sourceA, writable: true, disableReason: null },
          { account: sourceB, writable: true, disableReason: null },
          { account: local, writable: true, disableReason: null },
        ]}
        selectedSourceAccountId={sourceA.id}
        selectedTargetAccountIds={[]}
        onSelectSource={onSelectSource}
        onToggleTarget={onToggleTarget}
        onClose={jest.fn()}
        onSync={jest.fn(async () => false)}
      />,
    );

    expect(screen.getByText('读取账号')).toBeTruthy();
    expect(screen.getByText('上传到')).toBeTruthy();
    expect(screen.queryByLabelText(`上传到 ${sourceA.displayName}（${sourceA.providerTitle}）`)).toBeNull();
    expect(screen.getByLabelText('从同步引导同步舞萌数据').props.accessibilityState.disabled).toBe(true);

    await fireEvent.press(screen.getByLabelText('展开读取账号列表'));
    await fireEvent.press(screen.getByLabelText('读取账号 落雪乙'));
    expect(onSelectSource).toHaveBeenCalledWith(sourceB.id);

    await fireEvent.press(screen.getByLabelText(`上传到 ${local.displayName}（${local.providerTitle}）`));
    expect(onToggleTarget).toHaveBeenCalledWith(local.id);
  });
});
