import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { UploadDataSheet } from '@/components/UploadDataSheet';
import { createLocalMaimaiAccount, createMaimaiBoundAccount, createMaxedMaimaiTestAccount } from '@/domain/bound-account';
import type { CatalogSnapshot } from '@/domain/models';
import type { ProviderSession } from '@/providers/contracts';
import { NotificationProvider } from '@/components/AppNotification';

type TestUploadPrefs = { friendCode: string; selectedAccountIds: string[] };
type TestHubAccount = { friendCode: string; hasCabinetBound: boolean; token?: string };
const mockLoadPrefs = jest.fn(async (): Promise<TestUploadPrefs> => ({
  friendCode: '', selectedAccountIds: [],
}));
const mockSavePrefs = jest.fn(async (_prefs: TestUploadPrefs) => undefined);
const mockLoadHubAccount = jest.fn(async (): Promise<TestHubAccount> => ({
  friendCode: '',
  hasCabinetBound: false,
}));
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
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 'jpeg' },
}));
jest.mock('@/services/maimai-qr-decode', () => {
  const actual = jest.requireActual<typeof import('@/services/maimai-qr-decode')>('@/services/maimai-qr-decode');
  return {
    ...actual,
    decodeMaimaiQrFromImageUri: jest.fn(async () => 'SGWCMAIDDECODED'),
  };
});
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
jest.mock('@/storage/score-hub-account-store', () => ({
  scoreHubAccountStore: {
    load: () => mockLoadHubAccount(),
    patch: jest.fn(),
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
    mockLoadHubAccount.mockResolvedValue({
      friendCode: '',
      hasCabinetBound: false,
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

  it('未绑定时好友码模式展示独立绑定区，开始上传不依赖绑定码', async () => {
    const screen = await renderSheet([water.id]);
    await waitFor(() => expect(screen.getByLabelText('开始上传').props.accessibilityState).toEqual({ disabled: false }));
    expect(await screen.findByLabelText('绑定用玩家二维码字符串')).toBeTruthy();
    expect(screen.getByLabelText('绑定玩家二维码')).toBeTruthy();
    expect(screen.getByText(/与上方「开始上传」互不影响/)).toBeTruthy();
    expect(screen.getByLabelText('开始上传').props.accessibilityState.disabled).toBe(false);
  });

  it('未绑定时切换二维码模式展示引导且禁用开始上传', async () => {
    const screen = await renderSheet([water.id]);
    await waitFor(() => expect(screen.getByLabelText('开始上传').props.accessibilityState).toEqual({ disabled: false }));
    await fireEvent.press(screen.getByLabelText('使用神秘二维码上传'));
    expect(await screen.findByLabelText('二维码需先绑定说明')).toBeTruthy();
    expect(screen.getByLabelText('切换到好友码上传并绑定')).toBeTruthy();
    expect(screen.queryByLabelText('神秘二维码字符串')).toBeNull();
    expect(screen.getByLabelText('开始上传').props.accessibilityState).toEqual({ disabled: true });
  });

  it('已绑定时默认神秘二维码且可缺少凭证提示', async () => {
    mockLoadHubAccount.mockResolvedValue({
      friendCode: '111111111111111',
      hasCabinetBound: true,
    });
    const screen = await renderSheet([water.id]);
    expect(await screen.findByLabelText('神秘二维码字符串')).toBeTruthy();
    expect(screen.queryByLabelText('score-hub 近一小时统计')).toBeNull();
    expect(screen.queryByLabelText('绑定玩家二维码')).toBeNull();
    await waitFor(() => expect(screen.getByLabelText('开始上传').props.accessibilityState).toEqual({ disabled: false }));
    await fireEvent.press(screen.getByLabelText('开始上传'));
    expect(await screen.findByText('缺少二维码')).toBeTruthy();
    expect(screen.getByText('请粘贴神秘二维码字符串，或从相册选择图片识别。')).toBeTruthy();
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

  it('未绑定且点仅绑定时缺少绑定二维码会提示', async () => {
    const screen = await renderSheet([water.id]);
    await waitFor(() => expect(screen.getByLabelText('绑定玩家二维码')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('绑定玩家二维码'));
    expect(await screen.findByText('缺少绑定二维码')).toBeTruthy();
  });

  it('已绑定时从相册选择后把识别到的字符串填入登录框', async () => {
    mockLoadHubAccount.mockResolvedValue({
      friendCode: '111111111111111',
      hasCabinetBound: true,
    });
    const imagePicker = jest.requireMock<typeof import('expo-image-picker')>('expo-image-picker');
    const decode = jest.requireMock<typeof import('@/services/maimai-qr-decode')>('@/services/maimai-qr-decode');
    (imagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///qr.jpg', fileName: 'qr.jpg' }],
    });
    (decode.decodeMaimaiQrFromImageUri as jest.Mock).mockResolvedValueOnce('SGWCMAIDFROMIMAGE');

    const screen = await renderSheet([water.id]);
    await waitFor(() => expect(screen.getByLabelText('开始上传').props.accessibilityState).toEqual({ disabled: false }));
    await fireEvent.press(screen.getByLabelText('从相册选择二维码图片'));
    await waitFor(() => {
      expect(screen.getByLabelText('神秘二维码字符串').props.value).toBe('SGWCMAIDFROMIMAGE');
    });
    expect(await screen.findByText('已识别二维码')).toBeTruthy();
  });

  it('未绑定时相册识码写入绑定框', async () => {
    const imagePicker = jest.requireMock<typeof import('expo-image-picker')>('expo-image-picker');
    const decode = jest.requireMock<typeof import('@/services/maimai-qr-decode')>('@/services/maimai-qr-decode');
    (imagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///bind-qr.jpg', fileName: 'bind-qr.jpg' }],
    });
    (decode.decodeMaimaiQrFromImageUri as jest.Mock).mockResolvedValueOnce('SGWCMAIDBIND');

    const screen = await renderSheet([water.id]);
    await waitFor(() => expect(screen.getByLabelText('绑定用玩家二维码字符串')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('从相册选择绑定用二维码图片'));
    await waitFor(() => {
      expect(screen.getByLabelText('绑定用玩家二维码字符串').props.value).toBe('SGWCMAIDBIND');
    });
  });

  it('已绑定时粘贴按钮可写入剪贴板中的二维码字符串', async () => {
    mockLoadHubAccount.mockResolvedValue({
      friendCode: '111111111111111',
      hasCabinetBound: true,
    });
    const clipboard = jest.requireMock<typeof import('expo-clipboard')>('expo-clipboard');
    (clipboard.getStringAsync as jest.Mock).mockResolvedValueOnce('SGWCMAIDFROMCLIP');
    const screen = await renderSheet([water.id]);
    await waitFor(() => expect(screen.getByLabelText('开始上传').props.accessibilityState).toEqual({ disabled: false }));
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
