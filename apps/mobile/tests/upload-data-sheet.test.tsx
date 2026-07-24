import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { UploadDataSheet } from '@/components/UploadDataSheet';
import { createLocalMaimaiAccount, createMaimaiBoundAccount, createMaxedMaimaiTestAccount } from '@/domain/bound-account';
import type { CatalogSnapshot } from '@/domain/models';
import type { ProviderSession } from '@/providers/contracts';
import { NotificationProvider } from '@/components/AppNotification';

type TestUploadPrefs = { friendCode: string; selectedAccountIds: string[] };
const mockLoadPrefs = jest.fn(async (): Promise<TestUploadPrefs> => ({
  friendCode: '', selectedAccountIds: [],
}));
const mockSavePrefs = jest.fn(async (_prefs: TestUploadPrefs) => undefined);
const mockIsMaimaiMaintenance = jest.fn(() => false);
const mockFetchStatistics = jest.fn(async () => ({
  dxnetJobs: {
    totalCount: 20,
    completedCount: 18,
    failedCount: 2,
    successRate: 90,
    avgDuration: 80_000,
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
}));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
}));
jest.mock('expo-clipboard', () => ({
  getStringAsync: jest.fn(async () => ''),
}));
jest.mock('react-native-gesture-handler', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return { GestureHandlerRootView: RN.View, Pressable: RN.Pressable };
});
jest.mock('@/storage/upload-prefs-store', () => ({
  uploadPrefsStore: {
    load: () => mockLoadPrefs(),
    save: (prefs: TestUploadPrefs) => mockSavePrefs(prefs),
  },
}));
jest.mock('@/domain/maimai-maintenance', () => ({
  isMaimaiMaintenanceWindow: () => mockIsMaimaiMaintenance(),
  MAIMAI_MAINTENANCE_MESSAGE: '维护窗口说明',
}));
jest.mock('@/services/score-hub-client', () => {
  const actual = jest.requireActual<typeof import('@/services/score-hub-client')>('@/services/score-hub-client');
  return {
    ...actual,
    fetchScoreHubStatistics: () => mockFetchStatistics(),
  };
});

const local = createLocalMaimaiAccount('本地玩家', 0);
const water = createMaimaiBoundAccount({
  providerId: 'diving-fish', displayName: '水鱼玩家', rating: 15000, playerId: 'water',
});
const testAccount = createMaxedMaimaiTestAccount(16750);
const waterSession: ProviderSession = {
  mode: 'import-token', value: 'water-token', persistable: true,
};
const catalog: CatalogSnapshot = {
  currentVersion: { id: 1, title: 'test' },
  versions: [{ id: 1, title: 'test' }],
  songs: [],
  chartVersionIndex: {},
  source: { kind: 'lxns', label: 'test', updatedAt: '2026-07-17T00:00:00.000Z', isStale: false },
};

function sheet(temporarySelectedAccountIds?: readonly string[], accounts = [local, water]) {
  return (
    <UploadDataSheet
      visible
      accounts={accounts}
      sessionsByAccountId={{ [water.id]: waterSession }}
      catalog={catalog}
      onClose={jest.fn()}
      temporarySelectedAccountIds={temporarySelectedAccountIds}
    />
  );
}

function renderSheet(temporarySelectedAccountIds?: readonly string[], accounts = [local, water]) {
  return render(
    <NotificationProvider>
      {sheet(temporarySelectedAccountIds, accounts)}
    </NotificationProvider>,
  );
}

describe('当前查分器上传弹窗临时选项', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsMaimaiMaintenance.mockReturnValue(false);
    mockFetchStatistics.mockResolvedValue({
      dxnetJobs: {
        totalCount: 20,
        completedCount: 18,
        failedCount: 2,
        successRate: 90,
        avgDuration: 80_000,
      },
    });
    mockLoadPrefs.mockResolvedValue({
      friendCode: '111111111111111',
      selectedAccountIds: [water.id],
    });
  });

  it('打开时展示近一小时统计、分档提示与好友申请刷新说明', async () => {
    const screen = await renderSheet([water.id]);
    expect(await screen.findByLabelText('score-hub 近一小时统计')).toBeTruthy();
    expect(screen.getByText(/近 1 小时成功率 90%/)).toBeTruthy();
    expect(screen.getByLabelText('score-hub 成功率提示')).toBeTruthy();
    expect(screen.getByText('近一小时成功率良好，通常可顺利完成。')).toBeTruthy();
    expect(screen.getAllByText(/多刷新几次才能看到申请/).length).toBeGreaterThan(0);
  });

  it('每次只临时勾选当前可写账号且不保存目标变化', async () => {
    const localOpen = await renderSheet([local.id]);
    const localBox = await waitFor(() => localOpen.getByLabelText('上传到 本地玩家（本地查分器）'));
    const waterBox = localOpen.getByLabelText('上传到 水鱼玩家（水鱼查分器）');
    expect(localBox.props.accessibilityState).toMatchObject({ checked: true });
    expect(waterBox.props.accessibilityState).toMatchObject({ checked: false });

    await fireEvent.press(waterBox);
    await fireEvent.changeText(localOpen.getByLabelText('舞萌好友码'), '222222222222222');
    await waitFor(() => expect(mockSavePrefs).toHaveBeenCalled(), { timeout: 1000 });
    expect(mockSavePrefs).toHaveBeenLastCalledWith({
      friendCode: '222222222222222',
      selectedAccountIds: [water.id],
    });
    await act(async () => localOpen.unmount());

    const normalOpen = await renderSheet([water.id]);
    const restoredLocal = await waitFor(() => normalOpen.getByLabelText('上传到 本地玩家（本地查分器）'));
    const restoredWater = normalOpen.getByLabelText('上传到 水鱼玩家（水鱼查分器）');
    expect(restoredLocal.props.accessibilityState).toMatchObject({ checked: false });
    expect(restoredWater.props.accessibilityState).toMatchObject({ checked: true });
  });

  it('当前账号不可写时不预选目标但仍展示禁用原因', async () => {
    const screen = await renderSheet([testAccount.id], [local, water, testAccount]);
    const localBox = await waitFor(() => screen.getByLabelText('上传到 本地玩家（本地查分器）'));
    const waterBox = screen.getByLabelText('上传到 水鱼玩家（水鱼查分器）');
    const testBox = screen.getByLabelText(/上传到 .*示例查分器/);
    expect(localBox.props.accessibilityState).toMatchObject({ checked: false });
    expect(waterBox.props.accessibilityState).toMatchObject({ checked: false });
    expect(testBox.props.accessibilityState).toMatchObject({ checked: false, disabled: true });
    expect(screen.getByText('测试成绩由曲库自动生成')).toBeTruthy();
  });

  it('好友码无效时显示顶部警告通知', async () => {
    mockLoadPrefs.mockResolvedValueOnce({ friendCode: '', selectedAccountIds: [water.id] });
    const screen = await renderSheet([water.id]);
    await waitFor(() => expect(screen.getByLabelText('开始上传').props.accessibilityState).toEqual({ disabled: false }));
    await fireEvent.press(screen.getByLabelText('开始上传'));
    expect(await screen.findByText('好友码无效')).toBeTruthy();
    expect(screen.getByText('请输入 15 位数字好友码。')).toBeTruthy();
    expect(screen.getByTestId('app-notification-outlet-overlay')).toBeTruthy();
    expect(screen.queryByTestId('app-notification-root-overlay')).toBeNull();
  });

  it('可切换到神秘二维码并在缺少凭证时提示', async () => {
    const screen = await renderSheet([water.id]);
    await waitFor(() => expect(screen.getByLabelText('开始上传').props.accessibilityState).toEqual({ disabled: false }));
    expect(screen.getByLabelText('score-hub 近一小时统计')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('使用神秘二维码上传'));
    expect(screen.getByLabelText('神秘二维码字符串')).toBeTruthy();
    expect(screen.getByLabelText('粘贴二维码字符串')).toBeTruthy();
    expect(screen.getByLabelText('从相册选择二维码图片')).toBeTruthy();
    expect(screen.getByText(/舞萌-中二公众号 → 玩家二维码/)).toBeTruthy();
    expect(screen.queryByLabelText('score-hub 近一小时统计')).toBeNull();
    await fireEvent.press(screen.getByLabelText('开始上传'));
    expect(await screen.findByText('缺少二维码')).toBeTruthy();
    expect(screen.getByText('请粘贴神秘二维码字符串，或选择二维码图片。')).toBeTruthy();
  });

  it('粘贴按钮可写入剪贴板中的二维码字符串', async () => {
    const clipboard = jest.requireMock<typeof import('expo-clipboard')>('expo-clipboard');
    (clipboard.getStringAsync as jest.Mock).mockResolvedValueOnce('SGWCMAIDFROMCLIP');
    const screen = await renderSheet([water.id]);
    await waitFor(() => expect(screen.getByLabelText('开始上传').props.accessibilityState).toEqual({ disabled: false }));
    await fireEvent.press(screen.getByLabelText('使用神秘二维码上传'));
    await fireEvent.press(screen.getByLabelText('粘贴二维码字符串'));
    await waitFor(() => {
      expect(screen.getByLabelText('神秘二维码字符串').props.value).toBe('SGWCMAIDFROMCLIP');
    });
  });

  it('维护窗口内停止上传并显示统一通知', async () => {
    mockIsMaimaiMaintenance.mockReturnValue(true);
    const screen = await renderSheet([water.id]);
    await waitFor(() => expect(screen.getByLabelText('开始上传').props.accessibilityState).toEqual({ disabled: false }));
    await fireEvent.press(screen.getByLabelText('开始上传'));
    expect(await screen.findByText('游戏服务器维护中')).toBeTruthy();
    expect(screen.getByText('维护窗口说明')).toBeTruthy();
  });
});
