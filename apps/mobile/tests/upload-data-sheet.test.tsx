import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { UploadDataSheet } from '@/components/UploadDataSheet';
import { createLocalMaimaiAccount, createMaimaiBoundAccount, createMaxedMaimaiTestAccount } from '@/domain/bound-account';
import type { CatalogSnapshot } from '@/domain/models';
import type { ProviderSession } from '@/providers/contracts';
import { NotificationProvider } from '@/components/AppNotification';
import { ScoreHubError } from '@/services/score-hub-client';

type TestUploadPrefs = {
  friendCode: string;
  selectedAccountIds: string[];
  selectionsByFriendCode?: Record<string, string[]>;
};
type TestSavePrefs = {
  friendCode: string;
  selectedAccountIds?: string[];
  writeSelection?: boolean;
};
type TestHubAccount = { friendCode: string; hasCabinetBound: boolean; token?: string };
type TestHubEntry = {
  friendCode: string;
  token: string;
  hasCabinetBound: boolean;
  updatedAt: number;
};
const mockLoadPrefs = jest.fn(async (): Promise<TestUploadPrefs> => ({
  friendCode: '', selectedAccountIds: [], selectionsByFriendCode: {},
}));
const mockSavePrefs = jest.fn(async (_prefs: TestSavePrefs) => undefined);
const mockRemoveSelection = jest.fn(async (_friendCode: string) => undefined);

let mockHubState: TestHubAccount = { friendCode: '', hasCabinetBound: false };
const mockHubAccounts = new Map<string, TestHubEntry>();

const mockLoadHubAccount = jest.fn(async (): Promise<TestHubAccount> => ({ ...mockHubState }));
const mockListWithToken = jest.fn(async (): Promise<TestHubEntry[]> => (
  [...mockHubAccounts.values()].sort((a, b) => b.updatedAt - a.updatedAt)
));
const mockGetByFriendCode = jest.fn(async (friendCode: string) => mockHubAccounts.get(friendCode.trim()) ?? null);
const mockSelect = jest.fn(async (friendCode: string) => {
  const entry = mockHubAccounts.get(friendCode.trim());
  mockHubState = entry
    ? { friendCode: entry.friendCode, hasCabinetBound: entry.hasCabinetBound, token: entry.token }
    : { friendCode: friendCode.trim(), hasCabinetBound: false };
  return { ...mockHubState };
});
const mockRemove = jest.fn(async (friendCode: string) => {
  mockHubAccounts.delete(friendCode.trim());
  if (mockHubState.friendCode === friendCode.trim()) {
    const next = [...mockHubAccounts.values()][0];
    mockHubState = next
      ? { friendCode: next.friendCode, hasCabinetBound: next.hasCabinetBound, token: next.token }
      : { friendCode: '', hasCabinetBound: false };
  }
  return {
    activeFriendCode: mockHubState.friendCode,
    accounts: Object.fromEntries([...mockHubAccounts.entries()]),
  };
});
const mockUpsert = jest.fn(async (partial: {
  friendCode: string;
  token?: string;
  hasCabinetBound?: boolean;
}) => {
  const code = partial.friendCode.trim();
  const existing = mockHubAccounts.get(code);
  const token = partial.token || existing?.token || '';
  if (code && token) {
    const entry: TestHubEntry = {
      friendCode: code,
      token,
      hasCabinetBound: typeof partial.hasCabinetBound === 'boolean'
        ? partial.hasCabinetBound
        : (existing?.hasCabinetBound === true),
      updatedAt: Date.now(),
    };
    mockHubAccounts.set(code, entry);
    mockHubState = { friendCode: code, hasCabinetBound: entry.hasCabinetBound, token };
  }
  return { ...mockHubState };
});
const mockBindCabinet = jest.fn(async () => ({ friendCode: '', alreadyBound: false }));
const mockUploadFriend = jest.fn(async () => ({
  uploaded: 1, skipped: 0, failedAccountNames: [], targetResults: [], refreshedAccounts: [],
}));
const mockUploadSession = jest.fn(async () => ({
  uploaded: 1, skipped: 0, failedAccountNames: [], targetResults: [], refreshedAccounts: [],
}));
const mockFetchMe = jest.fn(async () => ({ friendCode: '111111111111111', hasCabinetUserId: false }));
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
    save: (prefs: TestSavePrefs) => mockSavePrefs(prefs),
    removeSelection: (friendCode: string) => mockRemoveSelection(friendCode),
  },
}));
jest.mock('@/storage/score-hub-account-store', () => ({
  scoreHubAccountStore: {
    load: () => mockLoadHubAccount(),
    patch: (partial: Partial<TestHubAccount>) => mockUpsert({
      friendCode: partial.friendCode ?? mockHubState.friendCode,
      token: partial.token,
      hasCabinetBound: partial.hasCabinetBound,
    }),
    upsert: (partial: { friendCode: string; token?: string; hasCabinetBound?: boolean }) => mockUpsert(partial),
    listWithToken: () => mockListWithToken(),
    getByFriendCode: (friendCode: string) => mockGetByFriendCode(friendCode),
    select: (friendCode: string) => mockSelect(friendCode),
    remove: (friendCode: string) => mockRemove(friendCode),
  },
}));
jest.mock('@/services/upload-maimai-from-friend-code', () => {
  const actual = jest.requireActual<typeof import('@/services/upload-maimai-from-friend-code')>(
    '@/services/upload-maimai-from-friend-code',
  );
  return {
    ...actual,
    bindScoreHubCabinetByQr: (...args: unknown[]) => (mockBindCabinet as (...a: unknown[]) => unknown)(...args),
    uploadMaimaiFromFriendCode: (...args: unknown[]) => (mockUploadFriend as (...a: unknown[]) => unknown)(...args),
    uploadMaimaiWithScoreHubSession: (...args: unknown[]) => (mockUploadSession as (...a: unknown[]) => unknown)(...args),
  };
});
jest.mock('@/domain/maimai-maintenance', () => ({
  isMaimaiMaintenanceWindow: () => mockIsMaimaiMaintenance(),
  MAIMAI_MAINTENANCE_MESSAGE: '维护窗口说明',
}));
jest.mock('@/services/score-hub-client', () => {
  const actual = jest.requireActual<typeof import('@/services/score-hub-client')>('@/services/score-hub-client');
  return {
    ...actual,
    fetchScoreHubStatistics: () => mockFetchStatistics(),
    fetchMe: (...args: unknown[]) => (mockFetchMe as (...a: unknown[]) => unknown)(...args),
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

function setHubEntry(entry: TestHubEntry) {
  mockHubAccounts.set(entry.friendCode, entry);
  mockHubState = {
    friendCode: entry.friendCode,
    hasCabinetBound: entry.hasCabinetBound,
    token: entry.token,
  };
}

function renderSheet(
  temporarySelectedAccountIds?: readonly string[],
  accounts = [local, water],
  visible = true,
) {
  return render(
    <NotificationProvider>
      <UploadDataSheet
        visible={visible}
        accounts={accounts}
        sessionsByAccountId={{ [water.id]: waterSession }}
        catalog={catalog}
        onClose={jest.fn()}
        temporarySelectedAccountIds={temporarySelectedAccountIds}
      />
    </NotificationProvider>,
  );
}

describe('好友码统一上传弹窗', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHubAccounts.clear();
    mockHubState = { friendCode: '', hasCabinetBound: false };
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
      selectionsByFriendCode: {
        '111111111111111': [water.id],
      },
    });
    mockFetchMe.mockResolvedValue({ friendCode: '111111111111111', hasCabinetUserId: false });
    mockBindCabinet.mockReset();
    mockBindCabinet.mockResolvedValue({ friendCode: '', alreadyBound: false });
    mockUploadFriend.mockResolvedValue({
      uploaded: 1, skipped: 0, failedAccountNames: [], targetResults: [], refreshedAccounts: [],
    });
    mockUploadSession.mockResolvedValue({
      uploaded: 1, skipped: 0, failedAccountNames: [], targetResults: [], refreshedAccounts: [],
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

  it('无 JWT 时不展示绑定按钮与绑定区', async () => {
    const screen = await renderSheet([water.id]);
    await waitFor(() => expect(screen.getByLabelText('开始上传').props.accessibilityState).toEqual({ disabled: false }));
    expect(screen.queryByLabelText('通过神秘二维码绑定')).toBeNull();
    expect(screen.queryByLabelText('绑定用玩家二维码字符串')).toBeNull();
    expect(screen.queryByLabelText('使用神秘二维码上传')).toBeNull();
  });

  it('有 JWT 未绑定时显示绑定按钮，展开后可绑定', async () => {
    setHubEntry({
      friendCode: '111111111111111',
      token: 'tok',
      hasCabinetBound: false,
      updatedAt: 1,
    });
    mockFetchMe.mockResolvedValue({ friendCode: '111111111111111', hasCabinetUserId: false });
    const screen = await renderSheet([water.id]);
    expect(await screen.findByLabelText('通过神秘二维码绑定')).toBeTruthy();
    expect(screen.queryByLabelText('绑定用玩家二维码字符串')).toBeNull();
    await fireEvent.press(screen.getByLabelText('通过神秘二维码绑定'));
    expect(await screen.findByLabelText('绑定用玩家二维码字符串')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('绑定玩家二维码'));
    expect(await screen.findByText('缺少绑定二维码')).toBeTruthy();
  });

  it('已绑定时不显示绑定按钮，开始上传走会话', async () => {
    setHubEntry({
      friendCode: '111111111111111',
      token: 'tok',
      hasCabinetBound: true,
      updatedAt: 1,
    });
    mockFetchMe.mockResolvedValue({ friendCode: '111111111111111', hasCabinetUserId: true });
    const screen = await renderSheet([water.id]);
    expect(await screen.findByLabelText('玩家二维码已绑定')).toBeTruthy();
    expect(screen.queryByLabelText('通过神秘二维码绑定')).toBeNull();
    await waitFor(() => expect(screen.getByLabelText('开始上传').props.accessibilityState).toEqual({ disabled: false }));
    await fireEvent.press(screen.getByLabelText('开始上传'));
    await waitFor(() => expect(mockUploadSession).toHaveBeenCalled());
    expect(mockUploadFriend).not.toHaveBeenCalled();
  });

  it('未绑定时开始上传走好友码逻辑', async () => {
    setHubEntry({
      friendCode: '111111111111111',
      token: 'tok',
      hasCabinetBound: false,
      updatedAt: 1,
    });
    mockFetchMe.mockResolvedValue({ friendCode: '111111111111111', hasCabinetUserId: false });
    const screen = await renderSheet([water.id]);
    await waitFor(() => expect(screen.getByLabelText('通过神秘二维码绑定')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('开始上传'));
    await waitFor(() => expect(mockUploadFriend).toHaveBeenCalled());
    expect(mockUploadSession).not.toHaveBeenCalled();
  });

  it('会话过期时自动回退好友码上传', async () => {
    setHubEntry({
      friendCode: '111111111111111',
      token: 'expired',
      hasCabinetBound: true,
      updatedAt: 1,
    });
    mockFetchMe.mockResolvedValue({ friendCode: '111111111111111', hasCabinetUserId: true });
    mockUploadSession.mockRejectedValueOnce(new ScoreHubError('登录已失效', 401));
    const screen = await renderSheet([water.id]);
    await waitFor(() => expect(screen.getByLabelText('玩家二维码已绑定')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('开始上传'));
    await waitFor(() => expect(mockUploadSession).toHaveBeenCalled());
    await waitFor(() => expect(mockUploadFriend).toHaveBeenCalled());
  });

  it('历史下拉可切换已保存好友码并支持删除', async () => {
    setHubEntry({
      friendCode: '111111111111111',
      token: 'tok-a',
      hasCabinetBound: false,
      updatedAt: 2,
    });
    mockHubAccounts.set('222222222222222', {
      friendCode: '222222222222222',
      token: 'tok-b',
      hasCabinetBound: true,
      updatedAt: 1,
    });
    mockFetchMe
      .mockResolvedValueOnce({ friendCode: '111111111111111', hasCabinetUserId: false })
      .mockResolvedValueOnce({ friendCode: '222222222222222', hasCabinetUserId: true });

    const screen = await renderSheet([water.id]);
    await waitFor(() => expect(screen.getByLabelText('通过神秘二维码绑定')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('选择已保存的 ScoreHub 好友码'));
    expect(await screen.findByLabelText('ScoreHub 好友码历史列表')).toBeTruthy();
    expect(screen.getByLabelText('删除好友码 222222222222222')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('选择好友码 222222222222222'));
    await waitFor(() => expect(screen.getByLabelText('舞萌好友码').props.value).toBe('222222222222222'));
    await waitFor(() => expect(screen.getByLabelText('玩家二维码已绑定')).toBeTruthy());
    expect(screen.queryByLabelText('通过神秘二维码绑定')).toBeNull();

    await fireEvent.press(screen.getByLabelText('选择已保存的 ScoreHub 好友码'));
    await fireEvent.press(screen.getByLabelText('删除好友码 111111111111111'));
    await waitFor(() => expect(mockRemove).toHaveBeenCalledWith('111111111111111'));
    await waitFor(() => expect(mockRemoveSelection).toHaveBeenCalledWith('111111111111111'));
    await waitFor(() => expect(screen.queryByLabelText('选择好友码 111111111111111')).toBeNull());
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
      selectedAccountIds: [local.id, water.id],
      writeSelection: false,
    });
    await act(async () => localOpen.unmount());

    const normalOpen = await renderSheet([water.id]);
    const restoredLocal = await waitFor(() => normalOpen.getByLabelText('上传到 本地玩家（本地查分器）'));
    const restoredWater = normalOpen.getByLabelText('上传到 水鱼玩家（水鱼查分器）');
    expect(restoredLocal.props.accessibilityState).toMatchObject({ checked: false });
    expect(restoredWater.props.accessibilityState).toMatchObject({ checked: true });
  });

  it('切换好友码时恢复各自「上传到」勾选', async () => {
    setHubEntry({
      friendCode: '111111111111111',
      token: 'tok-a',
      hasCabinetBound: false,
      updatedAt: 2,
    });
    mockHubAccounts.set('222222222222222', {
      friendCode: '222222222222222',
      token: 'tok-b',
      hasCabinetBound: false,
      updatedAt: 1,
    });
    mockLoadPrefs.mockResolvedValue({
      friendCode: '111111111111111',
      selectedAccountIds: [local.id],
      selectionsByFriendCode: {
        '111111111111111': [local.id],
        '222222222222222': [water.id],
      },
    });
    mockFetchMe.mockResolvedValue({ friendCode: '111111111111111', hasCabinetUserId: false });

    const screen = await renderSheet();
    await waitFor(() => {
      expect(screen.getByLabelText('上传到 本地玩家（本地查分器）').props.accessibilityState).toMatchObject({ checked: true });
    });
    expect(screen.getByLabelText('上传到 水鱼玩家（水鱼查分器）').props.accessibilityState).toMatchObject({ checked: false });

    await fireEvent.press(screen.getByLabelText('选择已保存的 ScoreHub 好友码'));
    await fireEvent.press(screen.getByLabelText('选择好友码 222222222222222'));
    await waitFor(() => expect(screen.getByLabelText('舞萌好友码').props.value).toBe('222222222222222'));
    await waitFor(() => {
      expect(screen.getByLabelText('上传到 水鱼玩家（水鱼查分器）').props.accessibilityState).toMatchObject({ checked: true });
    });
    expect(screen.getByLabelText('上传到 本地玩家（本地查分器）').props.accessibilityState).toMatchObject({ checked: false });
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
    mockLoadPrefs.mockResolvedValueOnce({
      friendCode: '',
      selectedAccountIds: [water.id],
      selectionsByFriendCode: {},
    });
    const screen = await renderSheet([water.id]);
    await waitFor(() => expect(screen.getByLabelText('开始上传').props.accessibilityState).toEqual({ disabled: false }));
    await fireEvent.press(screen.getByLabelText('开始上传'));
    expect(await screen.findByText('好友码无效')).toBeTruthy();
    expect(screen.getByText('请输入 15 位数字好友码。')).toBeTruthy();
  });

  it('未绑定时相册识码写入绑定框', async () => {
    setHubEntry({
      friendCode: '111111111111111',
      token: 'tok',
      hasCabinetBound: false,
      updatedAt: 1,
    });
    mockFetchMe.mockResolvedValue({ friendCode: '111111111111111', hasCabinetUserId: false });
    const imagePicker = jest.requireMock<typeof import('expo-image-picker')>('expo-image-picker');
    const decode = jest.requireMock<typeof import('@/services/maimai-qr-decode')>('@/services/maimai-qr-decode');
    (imagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///bind-qr.jpg', fileName: 'bind-qr.jpg' }],
    });
    (decode.decodeMaimaiQrFromImageUri as jest.Mock).mockResolvedValueOnce('SGWCMAIDBIND');

    const screen = await renderSheet([water.id]);
    await waitFor(() => expect(screen.getByLabelText('通过神秘二维码绑定')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('通过神秘二维码绑定'));
    await fireEvent.press(screen.getByLabelText('从相册选择绑定用二维码图片'));
    await waitFor(() => {
      expect(screen.getByLabelText('绑定用玩家二维码字符串').props.value).toBe('SGWCMAIDBIND');
    });
  });

  it('关闭弹窗不中止绑定，重开仍为进行中', async () => {
    setHubEntry({
      friendCode: '111111111111111',
      token: 'tok',
      hasCabinetBound: false,
      updatedAt: 1,
    });
    mockFetchMe.mockResolvedValue({ friendCode: '111111111111111', hasCabinetUserId: false });
    let resolveBind: (() => void) | null = null;
    mockBindCabinet.mockImplementationOnce(() => new Promise((resolve) => {
      resolveBind = () => resolve({ friendCode: '111111111111111', alreadyBound: false });
    }));
    const onPhaseChange = jest.fn();
    const onClose = jest.fn();

    const renderVisible = (visible: boolean) => (
      <NotificationProvider>
        <UploadDataSheet
          visible={visible}
          accounts={[local, water]}
          sessionsByAccountId={{ [water.id]: waterSession }}
          catalog={catalog}
          onClose={onClose}
          onPhaseChange={onPhaseChange}
          temporarySelectedAccountIds={[water.id]}
        />
      </NotificationProvider>
    );

    const view = await render(renderVisible(true));
    await waitFor(() => expect(view.getByLabelText('通过神秘二维码绑定')).toBeTruthy());
    await fireEvent.press(view.getByLabelText('通过神秘二维码绑定'));
    await fireEvent.changeText(view.getByLabelText('绑定用玩家二维码字符串'), 'SGWCMAIDBIND');
    await fireEvent.press(view.getByLabelText('绑定玩家二维码'));
    await waitFor(() => expect(mockBindCabinet).toHaveBeenCalled());
    await waitFor(() => {
      expect(onPhaseChange).toHaveBeenCalledWith(expect.objectContaining({ kind: 'binding' }));
    });

    await fireEvent.press(view.getByLabelText('关闭上传'));
    expect(onClose).toHaveBeenCalled();
    expect(onPhaseChange).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'binding' }));

    await act(async () => {
      view.rerender(renderVisible(false));
    });
    await act(async () => {
      view.rerender(renderVisible(true));
    });

    await waitFor(() => expect(view.getByLabelText('取消当前操作')).toBeTruthy());
    await act(async () => {
      resolveBind?.();
    });
    await waitFor(() => {
      expect(onPhaseChange).toHaveBeenCalledWith(expect.objectContaining({ kind: 'done' }));
    });
  });

  it('上传完成后 5 秒将按钮小字阶段归零为 idle', async () => {
    jest.useFakeTimers({ advanceTimers: true });
    try {
      setHubEntry({
        friendCode: '111111111111111',
        token: 'tok',
        hasCabinetBound: false,
        updatedAt: 1,
      });
      mockFetchMe.mockResolvedValue({ friendCode: '111111111111111', hasCabinetUserId: false });
      mockBindCabinet.mockResolvedValueOnce({ friendCode: '111111111111111', alreadyBound: false });
      const onPhaseChange = jest.fn();
      const view = await render(
        <NotificationProvider>
          <UploadDataSheet
            visible
            accounts={[local, water]}
            sessionsByAccountId={{ [water.id]: waterSession }}
            catalog={catalog}
            onClose={jest.fn()}
            onPhaseChange={onPhaseChange}
            temporarySelectedAccountIds={[water.id]}
          />
        </NotificationProvider>,
      );

      await waitFor(() => expect(view.getByLabelText('通过神秘二维码绑定')).toBeTruthy());
      await fireEvent.press(view.getByLabelText('通过神秘二维码绑定'));
      await fireEvent.changeText(view.getByLabelText('绑定用玩家二维码字符串'), 'SGWCMAIDBIND');
      await fireEvent.press(view.getByLabelText('绑定玩家二维码'));
      await waitFor(() => {
        expect(onPhaseChange).toHaveBeenCalledWith(expect.objectContaining({ kind: 'done' }));
      });

      await act(async () => {
        jest.advanceTimersByTime(5_000);
      });
      expect(onPhaseChange).toHaveBeenCalledWith({ kind: 'idle' });
    } finally {
      jest.useRealTimers();
    }
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
