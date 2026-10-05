import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { UploadTaskController, uploadTaskController } from '@/services/upload-task-controller';
import { useUploadTaskState } from '@/hooks/use-upload-task';
import { useUploadAccountPreferences } from '@/hooks/use-upload-account-preferences';
import { UploadDataSheet } from '@/components/UploadDataSheet';
import { createLocalMaimaiAccount, createMaimaiBoundAccount, createMaxedMaimaiTestAccount } from '@/domain/bound-account';
import type { CatalogSnapshot } from '@/domain/models';
import type { ProviderSession } from '@/providers/contracts';
import type { LxnsTokenRotationUpdate } from '@/providers/lxns-oauth-request';
import { NotificationProvider } from '@/components/AppNotification';
import { ScoreHubError } from '@/services/score-hub-client';
import { SessionPersistenceError } from '@/domain/session-vault';
jest.mock('@/services/upload-task-controller', () => {
  const actual = jest.requireActual<typeof import('@/services/upload-task-controller')>('@/services/upload-task-controller');
  return { ...actual, uploadTaskController: new actual.UploadTaskController() };
});

type TestUploadPrefs = {
  friendCode: string;
  selectedAccountIds: string[];
  selectionsByFriendCode: Record<string, string[]>;
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
type MockUploadInput = {
  onLxnsTokensRotated?: (accountId: string, update: LxnsTokenRotationUpdate) => unknown;
  onPhase: (phase: {
    kind: string;
    message?: string;
    uploaded?: number;
    skipped?: number;
    authMode?: string;
  }) => void;
  resolveCatalog: () => Promise<CatalogSnapshot>;
  onQrAccepted?: () => void;
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
const mockUploadFriend = jest.fn(async (_input: MockUploadInput) => ({
  uploaded: 1, skipped: 0, failedAccountNames: [], targetResults: [], refreshedAccounts: [],
}));
const mockUploadSession = jest.fn(async (_input: MockUploadInput) => ({
  uploaded: 1, skipped: 0, failedAccountNames: [], targetResults: [], refreshedAccounts: [],
}));
const mockUploadQr = jest.fn(async (_input: MockUploadInput) => ({
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
const mockDeletePickedFile = jest.fn((_uri: string) => undefined);

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
jest.mock('expo-file-system', () => {
  const actual = jest.requireActual<typeof import('expo-file-system')>('expo-file-system');
  return {
    ...actual,
    Paths: class extends actual.Paths {
      static get cache() { return { uri: 'file:///cache/' } as InstanceType<typeof actual.Directory>; }
    },
    File: class {
      readonly uri: string;
      constructor(uri: string) { this.uri = uri; }
      delete() { mockDeletePickedFile(this.uri); }
    },
  };
});
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
    uploadMaimaiFromQrLogin: (...args: unknown[]) => (mockUploadQr as (...a: unknown[]) => unknown)(...args),
    uploadMaimaiWithScoreHubSession: (...args: unknown[]) => (mockUploadSession as (...a: unknown[]) => unknown)(...args),
    uploadMaimaiPreferringSession: async (input: MockUploadInput & {
      preferSession?: boolean;
      signal?: { aborted?: boolean };
    }) => {
      if (input.preferSession) {
        try {
          return await mockUploadSession(input);
        } catch (error) {
          if (input.signal?.aborted) throw error;
          if (!actual.isScoreHubAuthExpired(error)) throw error;
          input.onPhase({
            kind: 'logging_in',
            message: '会话已失效，改用好友码重新登录…',
            authMode: 'friend_code',
          });
        }
      }
      return mockUploadFriend(input);
    },
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
  uploadMethod: 'friend_code' | 'qr' = 'friend_code',
  catalogValue: CatalogSnapshot | null | undefined = catalog,
  requestCatalog?: () => Promise<CatalogSnapshot | undefined>,
  onLxnsTokensRotated?: (accountId: string, update: LxnsTokenRotationUpdate) => void,
) {
  return render(
    <NotificationProvider>
      <UploadDataSheet
        visible={visible}
        accounts={accounts}
        sessionsByAccountId={{ [water.id]: waterSession }}
        catalog={catalogValue ?? undefined}
        requestCatalog={requestCatalog}
        onLxnsTokensRotated={onLxnsTokensRotated}
        onClose={jest.fn()}
        temporarySelectedAccountIds={temporarySelectedAccountIds}
        uploadMethod={uploadMethod}
      />
    </NotificationProvider>,
  );
}

describe('好友码统一上传弹窗', () => {
  it.each(['friend_code', 'qr'] as const)('%s 取消后仍交付已完成的凭据轮换，且不完成旧任务', async (method) => {
    let input!: MockUploadInput;
    let finish!: () => void;
    const upload = method === 'qr' ? mockUploadQr : mockUploadFriend;
    upload.mockImplementationOnce(value => {
      input = value;
      return new Promise(resolve => { finish = () => resolve({ uploaded: 1, skipped: 0,
        failedAccountNames: [], targetResults: [], refreshedAccounts: [] }); });
    });
    const rotated = jest.fn();
    const view = await renderSheet([water.id], [local, water], true, method, catalog, undefined, rotated);
    if (method === 'qr') {
      await fireEvent.changeText(await view.findByLabelText('玩家二维码字符串'), 'SGWCMAIDCURRENT');
    }
    const label = method === 'qr' ? '用二维码同步成绩' : '开始上传';
    await waitFor(() => expect(view.getByLabelText(label).props.accessibilityState.disabled).toBe(false));
    await fireEvent.press(view.getByLabelText(label));
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    await fireEvent.press(view.getByLabelText('取消当前操作'));
    const previous = { mode: 'lxns-oauth' as const, accessToken: 'a', refreshToken: 'r', expiresAt: 1, persistable: true as const };
    const update = { previous, next: { ...previous, accessToken: 'b', refreshToken: 's' } };
    await act(async () => { await input.onLxnsTokensRotated?.('account', update); finish(); });
    expect(rotated).toHaveBeenCalledWith('account', update);
    expect(uploadTaskController.getSnapshot().status).toBe('canceled');
    await view.unmount();
  });
  beforeEach(() => {
    jest.requireMock<{ uploadTaskController: UploadTaskController }>('@/services/upload-task-controller').uploadTaskController = new UploadTaskController();
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
    mockUploadQr.mockResolvedValue({
      uploaded: 1, skipped: 0, failedAccountNames: [], targetResults: [], refreshedAccounts: [],
    });
  });

  it('偏好读取期间账号更新仍完成初始化并使用当前可写账号', async () => {
    let finish!: (prefs: TestUploadPrefs) => void;
    mockLoadPrefs.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const hook = await renderHook<ReturnType<typeof useUploadAccountPreferences>, { accounts: (typeof local)[] }>(({ accounts }) => useUploadAccountPreferences({
      visible: true, running: false, decodingQr: false, accounts,
      sessionsByAccountId: { [water.id]: waterSession },
    }), { initialProps: { accounts: [local] }, wrapper: NotificationProvider });
    await hook.rerender({ accounts: [local, water] });
    await act(async () => finish({ friendCode: '', selectedAccountIds: [water.id], selectionsByFriendCode: { '': [water.id] } }));
    await waitFor(() => expect(hook.result.current.prefsReady).toBe(true));
    expect(hook.result.current.selectedIds).toEqual([water.id]);
    await hook.unmount();
  });

  it('好友码快速切换丢弃旧偏好并保留新账号勾选', async () => {
    const hook = await renderHook(() => useUploadAccountPreferences({
      visible: true, running: false, decodingQr: false, accounts: [local, water],
      sessionsByAccountId: { [water.id]: waterSession },
    }), { wrapper: NotificationProvider });
    await waitFor(() => expect(hook.result.current.prefsReady).toBe(true));
    let finishOld!: (prefs: TestUploadPrefs) => void;
    mockLoadPrefs.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
    await act(async () => hook.result.current.onFriendCodeChange('222222222222222'));
    mockLoadPrefs.mockResolvedValueOnce({ friendCode: '333333333333333', selectedAccountIds: [local.id], selectionsByFriendCode: { '333333333333333': [local.id] } });
    await act(async () => hook.result.current.onFriendCodeChange('333333333333333'));
    await waitFor(() => expect(hook.result.current.selectedIds).toEqual([local.id]));
    await act(async () => finishOld({ friendCode: '222222222222222', selectedAccountIds: [water.id], selectionsByFriendCode: { '222222222222222': [water.id] } }));
    expect(hook.result.current.friendCode).toBe('333333333333333');
    expect(hook.result.current.selectedIds).toEqual([local.id]);
    expect(mockSelect).not.toHaveBeenCalledWith('222222222222222');
    await hook.unmount();
  });

  it('慢偏好读取不会把上个好友码的勾选写入新好友码', async () => {
    const hook = await renderHook(() => useUploadAccountPreferences({
      visible: true, running: false, decodingQr: false, accounts: [local, water],
      sessionsByAccountId: { [water.id]: waterSession },
    }), { wrapper: NotificationProvider });
    await waitFor(() => expect(hook.result.current.prefsReady).toBe(true));
    jest.useFakeTimers();
    try {
      let finish!: (prefs: TestUploadPrefs) => void;
      mockLoadPrefs.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
      await act(async () => hook.result.current.onFriendCodeChange('222222222222222'));
      await act(async () => { jest.advanceTimersByTime(400); });
      expect(mockSavePrefs).toHaveBeenLastCalledWith({ friendCode: '222222222222222', selectedAccountIds: [water.id], writeSelection: false });
      await act(async () => finish({ friendCode: '222222222222222', selectedAccountIds: [local.id], selectionsByFriendCode: { '222222222222222': [local.id] } }));
      await act(async () => { jest.advanceTimersByTime(400); });
      expect(mockSavePrefs).toHaveBeenLastCalledWith({ friendCode: '222222222222222', selectedAccountIds: [local.id], writeSelection: true });
    } finally {
      await hook.unmount();
      jest.useRealTimers();
    }
  });

  it('删除旧好友码期间切换账号不会被迟到清理重置登录状态', async () => {
    setHubEntry({ friendCode: '111111111111111', token: 'tok-a', hasCabinetBound: false, updatedAt: 2 });
    mockHubAccounts.set('222222222222222', { friendCode: '222222222222222', token: 'tok-b', hasCabinetBound: true, updatedAt: 1 });
    const hook = await renderHook(() => useUploadAccountPreferences({
      visible: true, running: false, decodingQr: false, accounts: [local, water],
      sessionsByAccountId: { [water.id]: waterSession },
    }), { wrapper: NotificationProvider });
    await waitFor(() => expect(hook.result.current.prefsReady && !hook.result.current.bindingLookup).toBe(true));
    let finish!: () => void;
    mockRemoveSelection.mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve(undefined); }));
    let removal!: Promise<void>;
    await act(async () => { removal = hook.result.current.removeStoredFriendCode('111111111111111'); });
    mockFetchMe.mockResolvedValueOnce({ friendCode: '222222222222222', hasCabinetUserId: true });
    await act(async () => hook.result.current.selectStoredFriendCode('222222222222222'));
    expect(hook.result.current.hasStoredToken).toBe(true);
    await act(async () => { finish(); await removal; });
    expect(hook.result.current.friendCode).toBe('222222222222222');
    expect(hook.result.current.hasStoredToken).toBe(true);
    expect(hook.result.current.hasCabinetBound).toBe(true);
    await hook.unmount();
  });

  it('取消后重新上传不会接收旧任务的进度、完成或错误回调', async () => {
    let oldInput!: MockUploadInput;
    let rejectOld!: (error: Error) => void;
    let finishNew!: () => void;
    mockUploadFriend.mockImplementationOnce(input => {
      oldInput = input;
      return new Promise((_resolve, reject) => { rejectOld = reject; });
    }).mockImplementationOnce(() => new Promise(resolve => {
      finishNew = () => resolve({ uploaded: 2, skipped: 0, failedAccountNames: [], targetResults: [], refreshedAccounts: [] });
    }));
    const screen = await renderSheet([water.id]);
    await waitFor(() => expect(screen.getByLabelText('开始上传').props.accessibilityState.disabled).toBe(false));
    await fireEvent.press(screen.getByLabelText('开始上传'));
    await waitFor(() => expect(mockUploadFriend).toHaveBeenCalledTimes(1));
    await fireEvent.press(screen.getByLabelText('取消当前操作'));
    await fireEvent.press(screen.getByLabelText('开始上传'));
    await waitFor(() => expect(mockUploadFriend).toHaveBeenCalledTimes(2));
    const current = uploadTaskController.getSnapshot();
    await act(async () => {
      oldInput.onPhase({ kind: 'done', message: '旧任务迟到', uploaded: 1, skipped: 0 });
      rejectOld(new Error('old task failed'));
    });
    expect(uploadTaskController.getSnapshot()).toBe(current);
    expect(screen.queryByText('旧任务迟到')).toBeNull();
    await act(async () => finishNew());
    expect(uploadTaskController.getSnapshot().result?.uploaded).toBe(2);
  });

  it('上传任务暂停后等待恢复，并复用同一个进行中任务', async () => {
    const signal = uploadTaskController.begin();
    const taskId = uploadTaskController.getSnapshot().taskId;
    expect(uploadTaskController.begin()).toBe(signal);
    expect(uploadTaskController.getSnapshot().taskId).toBe(taskId);

    uploadTaskController.pause();
    let resumed = false;
    const waiting = signal.waitUntilResumed?.().then(() => { resumed = true; });
    await Promise.resolve();
    expect(resumed).toBe(false);

    uploadTaskController.resume();
    await waiting;
    expect(resumed).toBe(true);
    expect(uploadTaskController.getSnapshot().status).toBe('running');
  });

  it('显式取消会永久结束暂停中的上传任务', async () => {
    const signal = uploadTaskController.begin();
    uploadTaskController.pause();
    const waiting = signal.waitUntilResumed?.();

    uploadTaskController.cancel();

    await expect(waiting).rejects.toThrow('已取消');
    expect(signal.aborted).toBe(true);
    expect(uploadTaskController.getSnapshot().status).toBe('canceled');
  });

  it('打开时展示近一小时统计、分档提示与好友申请刷新说明', async () => {
    const screen = await renderSheet([water.id]);
    expect(await screen.findByLabelText('score-hub 近一小时统计')).toBeTruthy();
    expect(screen.getByText(/近 1 小时成功率 90%/)).toBeTruthy();
    expect(screen.getByLabelText('score-hub 成功率提示')).toBeTruthy();
    expect(screen.getByText('近一小时成功率良好，通常可顺利完成。')).toBeTruthy();
    expect(screen.getAllByText(/多刷新几次才能看到申请/).length).toBeGreaterThan(0);
  });

  it('好友码页不展示玩家二维码入口', async () => {
    const screen = await renderSheet([water.id]);
    await waitFor(() => expect(screen.getByLabelText('开始上传').props.accessibilityState).toEqual({ disabled: false }));
    expect(screen.queryByLabelText('玩家二维码字符串')).toBeNull();
    expect(screen.queryByLabelText('用二维码同步成绩')).toBeNull();
  });

  it('玩家二维码页直接显示输入与独立同步按钮', async () => {
    setHubEntry({
      friendCode: '111111111111111',
      token: 'tok',
      hasCabinetBound: false,
      updatedAt: 1,
    });
    mockFetchMe.mockResolvedValue({ friendCode: '111111111111111', hasCabinetUserId: false });
    const screen = await renderSheet([water.id], [local, water], true, 'qr');
    expect(await screen.findByLabelText('玩家二维码字符串')).toBeTruthy();
    expect(screen.queryByLabelText('舞萌好友码')).toBeNull();
    expect(screen.queryByLabelText('开始上传')).toBeNull();
    expect(screen.queryByLabelText('score-hub 近一小时统计')).toBeNull();
    await fireEvent.press(screen.getByLabelText('用二维码同步成绩'));
    expect(await screen.findByText('缺少玩家二维码')).toBeTruthy();
  });

  it('离开玩家二维码页后清空未提交的二维码内容', async () => {
    const renderMethod = (uploadMethod: 'friend_code' | 'qr') => (
      <NotificationProvider>
        <UploadDataSheet
          visible
          accounts={[local, water]}
          sessionsByAccountId={{ [water.id]: waterSession }}
          catalog={catalog}
          onClose={jest.fn()}
          temporarySelectedAccountIds={[water.id]}
          uploadMethod={uploadMethod}
        />
      </NotificationProvider>
    );
    const screen = await render(renderMethod('qr'));
    await fireEvent.changeText(await screen.findByLabelText('玩家二维码字符串'), 'SGWCMAIDCURRENT');

    await act(async () => {
      screen.rerender(renderMethod('friend_code'));
    });
    expect(screen.queryByLabelText('玩家二维码字符串')).toBeNull();
    await act(async () => {
      screen.rerender(renderMethod('qr'));
    });
    expect((await screen.findByLabelText('玩家二维码字符串')).props.value).toBe('');
  });

  it('已保存账号时好友码上传直接获取成绩', async () => {
    setHubEntry({
      friendCode: '111111111111111',
      token: 'tok',
      hasCabinetBound: true,
      updatedAt: 1,
    });
    mockFetchMe.mockResolvedValue({ friendCode: '111111111111111', hasCabinetUserId: true });
    const screen = await renderSheet([water.id]);
    expect(await screen.findByLabelText('已保存舞萌账号')).toBeTruthy();
    expect(screen.queryByLabelText('玩家二维码字符串')).toBeNull();
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
    await waitFor(() => expect(screen.getByLabelText('开始上传').props.accessibilityState.disabled).toBe(false));
    await fireEvent.press(screen.getByLabelText('开始上传'));
    await waitFor(() => expect(mockUploadFriend).toHaveBeenCalled());
    expect(mockUploadSession).not.toHaveBeenCalled();
  });

  it('曲库为空时仍先读取好友码成绩，失败后只重试曲库并续接原任务', async () => {
    setHubEntry({
      friendCode: '111111111111111',
      token: 'tok',
      hasCabinetBound: false,
      updatedAt: 1,
    });
    mockFetchMe.mockResolvedValue({ friendCode: '111111111111111', hasCabinetUserId: false });
    const events: string[] = [];
    const requestCatalog = jest.fn<() => Promise<CatalogSnapshot | undefined>>()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(catalog);
    mockUploadFriend.mockImplementationOnce(async (input: MockUploadInput) => {
      events.push('scores');
      input.onPhase({ kind: 'fetching_scores', message: '成绩已获取' });
      await input.resolveCatalog();
      events.push('upload');
      input.onPhase({ kind: 'done', message: '完成', uploaded: 1, skipped: 0 });
      return { uploaded: 1, skipped: 0, failedAccountNames: [], targetResults: [], refreshedAccounts: [] };
    });

    const screen = await renderSheet([water.id], [local, water], true, 'friend_code', null, requestCatalog);
    await waitFor(() => expect(screen.getByLabelText('开始上传').props.accessibilityState.disabled).toBe(false));
    await fireEvent.press(screen.getByLabelText('开始上传'));

    await waitFor(() => expect(screen.getByLabelText('重试同步曲库')).toBeTruthy());
    expect(screen.getByText('成绩已获取，曲库暂未同步。请重试。')).toBeTruthy();
    expect(events).toEqual(['scores']);
    expect(mockUploadFriend).toHaveBeenCalledTimes(1);
    expect(requestCatalog).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByLabelText('重试同步曲库'));
    await waitFor(() => expect(events).toEqual(['scores', 'upload']));
    expect(mockUploadFriend).toHaveBeenCalledTimes(1);
    expect(requestCatalog).toHaveBeenCalledTimes(2);
  });

  it('曲库持续失败时保留重试入口和当前上传任务', async () => {
    const requestCatalog = jest.fn(async () => {
      throw new Error('network');
    });
    mockUploadFriend.mockImplementationOnce(async (input: MockUploadInput) => {
      input.onPhase({ kind: 'fetching_scores', message: '成绩已获取' });
      await input.resolveCatalog();
      return { uploaded: 1, skipped: 0, failedAccountNames: [], targetResults: [], refreshedAccounts: [] };
    });
    const screen = await renderSheet([water.id], [local, water], true, 'friend_code', null, requestCatalog);
    await waitFor(() => expect(screen.getByLabelText('开始上传').props.accessibilityState.disabled).toBe(false));
    await fireEvent.press(screen.getByLabelText('开始上传'));
    await waitFor(() => expect(screen.getByLabelText('重试同步曲库')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('重试同步曲库'));
    await waitFor(() => expect(requestCatalog).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('重试同步曲库')).toBeTruthy();
    expect(mockUploadFriend).toHaveBeenCalledTimes(1);
  });

  it('其它查询先取得曲库时自动唤醒等待中的上传', async () => {
    const requestCatalog = jest.fn(async () => undefined);
    mockUploadFriend.mockImplementationOnce(async (input: MockUploadInput) => {
      input.onPhase({ kind: 'fetching_scores', message: '成绩已获取' });
      await input.resolveCatalog();
      input.onPhase({ kind: 'done', message: '完成', uploaded: 1, skipped: 0 });
      return { uploaded: 1, skipped: 0, failedAccountNames: [], targetResults: [], refreshedAccounts: [] };
    });
    const renderCatalog = (catalogValue: CatalogSnapshot | undefined) => (
      <NotificationProvider>
        <UploadDataSheet
          visible
          accounts={[local, water]}
          sessionsByAccountId={{ [water.id]: waterSession }}
          catalog={catalogValue}
          requestCatalog={requestCatalog}
          onClose={jest.fn()}
          temporarySelectedAccountIds={[water.id]}
        />
      </NotificationProvider>
    );
    const screen = await render(renderCatalog(undefined));
    await waitFor(() => expect(screen.getByLabelText('开始上传').props.accessibilityState.disabled).toBe(false));
    await fireEvent.press(screen.getByLabelText('开始上传'));
    await waitFor(() => expect(screen.getByLabelText('重试同步曲库')).toBeTruthy());

    await act(async () => {
      screen.rerender(renderCatalog(catalog));
    });
    await waitFor(() => expect(screen.queryByLabelText('取消当前操作')).toBeNull());
    expect(mockUploadFriend).toHaveBeenCalledTimes(1);
    expect(requestCatalog).toHaveBeenCalledTimes(1);
  });

  it('关闭再打开弹层仍保留等待中的成绩并可继续同步曲库', async () => {
    const requestCatalog = jest.fn<() => Promise<CatalogSnapshot | undefined>>()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(catalog);
    mockUploadFriend.mockImplementationOnce(async (input: MockUploadInput) => {
      input.onPhase({ kind: 'fetching_scores', message: '成绩已获取' });
      await input.resolveCatalog();
      input.onPhase({ kind: 'done', message: '完成', uploaded: 1, skipped: 0 });
      return { uploaded: 1, skipped: 0, failedAccountNames: [], targetResults: [], refreshedAccounts: [] };
    });
    const renderVisible = (visible: boolean) => (
      <NotificationProvider>
        <UploadDataSheet
          visible={visible}
          accounts={[local, water]}
          sessionsByAccountId={{ [water.id]: waterSession }}
          catalog={undefined}
          requestCatalog={requestCatalog}
          onClose={jest.fn()}
          temporarySelectedAccountIds={[water.id]}
        />
      </NotificationProvider>
    );
    const screen = await render(renderVisible(true));
    await waitFor(() => expect(screen.getByLabelText('开始上传').props.accessibilityState.disabled).toBe(false));
    await fireEvent.press(screen.getByLabelText('开始上传'));
    await waitFor(() => expect(screen.getByLabelText('重试同步曲库')).toBeTruthy());
    await act(async () => screen.rerender(renderVisible(false)));
    await act(async () => screen.rerender(renderVisible(true)));
    await waitFor(() => expect(screen.getByLabelText('重试同步曲库')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('重试同步曲库'));
    await waitFor(() => expect(screen.queryByLabelText('取消当前操作')).toBeNull());
    expect(mockUploadFriend).toHaveBeenCalledTimes(1);
    expect(requestCatalog).toHaveBeenCalledTimes(2);
  });

  it('等待曲库时取消会释放原始成绩并结束当前任务', async () => {
    const requestCatalog = jest.fn(async () => undefined);
    mockUploadFriend.mockImplementationOnce(async (input: MockUploadInput) => {
      input.onPhase({ kind: 'fetching_scores', message: '成绩已获取' });
      await input.resolveCatalog();
      return { uploaded: 1, skipped: 0, failedAccountNames: [], targetResults: [], refreshedAccounts: [] };
    });
    const screen = await renderSheet([water.id], [local, water], true, 'friend_code', null, requestCatalog);
    await waitFor(() => expect(screen.getByLabelText('开始上传').props.accessibilityState.disabled).toBe(false));
    await fireEvent.press(screen.getByLabelText('开始上传'));
    await waitFor(() => expect(screen.getByLabelText('重试同步曲库')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('取消当前操作'));
    await waitFor(() => expect(screen.queryByLabelText('取消当前操作')).toBeNull());
    expect(mockUploadFriend).toHaveBeenCalledTimes(1);
  });

  it('组件卸载后任务保持，显式取消才释放等待中的成绩', async () => {
    const requestCatalog = jest.fn(async () => undefined);
    let released = false;
    mockUploadFriend.mockImplementationOnce(async (input: MockUploadInput) => {
      input.onPhase({ kind: 'fetching_scores', message: '成绩已获取' });
      try {
        await input.resolveCatalog();
      } finally {
        released = true;
      }
      return { uploaded: 1, skipped: 0, failedAccountNames: [], targetResults: [], refreshedAccounts: [] };
    });
    const screen = await renderSheet([water.id], [local, water], true, 'friend_code', null, requestCatalog);
    await waitFor(() => expect(screen.getByLabelText('开始上传').props.accessibilityState.disabled).toBe(false));
    await fireEvent.press(screen.getByLabelText('开始上传'));
    await waitFor(() => expect(screen.getByLabelText('重试同步曲库')).toBeTruthy());
    await act(async () => screen.unmount());
    expect(released).toBe(false);
    uploadTaskController.cancel();
    await waitFor(() => expect(released).toBe(true));
    expect(mockUploadFriend).toHaveBeenCalledTimes(1);
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
    await waitFor(() => expect(screen.getByLabelText('已保存舞萌账号')).toBeTruthy());
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
    await waitFor(() => expect(screen.getByLabelText('开始上传').props.accessibilityState.disabled).toBe(false));
    await fireEvent.press(screen.getByLabelText('选择已保存的 ScoreHub 好友码'));
    expect(await screen.findByLabelText('ScoreHub 好友码历史列表')).toBeTruthy();
    expect(screen.getByLabelText('删除好友码 222222222222222')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('选择好友码 222222222222222'));
    await waitFor(() => expect(screen.getByLabelText('舞萌好友码').props.value).toBe('222222222222222'));
    await waitFor(() => expect(screen.getByLabelText('已保存舞萌账号')).toBeTruthy());
    expect(screen.queryByLabelText('玩家二维码字符串')).toBeNull();

    await fireEvent.press(screen.getByLabelText('选择已保存的 ScoreHub 好友码'));
    await fireEvent.press(screen.getByLabelText('删除好友码 111111111111111'));
    await waitFor(() => expect(mockRemove).toHaveBeenCalledWith('111111111111111'));
    await waitFor(() => expect(mockRemoveSelection).toHaveBeenCalledWith('111111111111111'));
    await waitFor(() => expect(screen.queryByLabelText('选择好友码 111111111111111')).toBeNull());
  });

  it('首次凭据读取失败保留未就绪状态且通知重试后可继续', async () => {
    mockLoadHubAccount.mockRejectedValueOnce(new SessionPersistenceError('credential_storage', { cause: new Error('private native detail') }));
    const screen = await renderSheet([water.id]);
    expect(await screen.findByText('无法安全保存账号凭据，请重试；若仍失败，请查看诊断。')).toBeTruthy();
    expect(screen.getByLabelText('开始上传').props.accessibilityState.disabled).toBe(true);
    expect(screen.queryByText('private native detail')).toBeNull();
    expect(mockSelect).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('重试'));
    await waitFor(() => expect(screen.getByLabelText('开始上传').props.accessibilityState.disabled).toBe(false));
    expect(mockUploadFriend).not.toHaveBeenCalled();
  });

  it('历史目录读取失败保留上次完整列表并允许重试', async () => {
    setHubEntry({ friendCode: '111111111111111', token: 'tok-a', hasCabinetBound: false, updatedAt: 2 });
    mockHubAccounts.set('222222222222222', { friendCode: '222222222222222', token: 'tok-b', hasCabinetBound: true, updatedAt: 1 });
    const screen = await renderSheet([water.id]);
    await waitFor(() => expect(mockUpsert).toHaveBeenCalled());
    mockListWithToken.mockRejectedValueOnce(new SessionPersistenceError('credential_storage'));
    await fireEvent.press(screen.getByLabelText('选择已保存的 ScoreHub 好友码'));
    expect(await screen.findByText('账号操作失败')).toBeTruthy();
    expect(screen.getByLabelText('选择好友码 111111111111111')).toBeTruthy();
    expect(screen.getByLabelText('选择好友码 222222222222222')).toBeTruthy();
    await fireEvent.press(screen.getByText('重试'));
    await waitFor(() => expect(mockListWithToken).toHaveBeenCalledTimes(4));
    expect(screen.getByLabelText('选择好友码 222222222222222')).toBeTruthy();
  });

  it('历史选择保存失败保持原好友码和勾选且重试成功后才发布偏好', async () => {
    setHubEntry({ friendCode: '111111111111111', token: 'tok-a', hasCabinetBound: false, updatedAt: 2 });
    mockHubAccounts.set('222222222222222', { friendCode: '222222222222222', token: 'tok-b', hasCabinetBound: true, updatedAt: 1 });
    mockLoadPrefs.mockResolvedValue({ friendCode: '111111111111111', selectedAccountIds: [water.id], selectionsByFriendCode: { '111111111111111': [water.id], '222222222222222': [local.id] } });
    const screen = await renderSheet();
    await waitFor(() => expect(mockUpsert).toHaveBeenCalled());
    await fireEvent.press(screen.getByLabelText('选择已保存的 ScoreHub 好友码'));
    mockSelect.mockRejectedValueOnce(new SessionPersistenceError('local_commit'));
    await fireEvent.press(screen.getByLabelText('选择好友码 222222222222222'));
    expect(await screen.findByText('无法保存本机账号信息，请重试；若仍失败，请查看诊断。')).toBeTruthy();
    expect(screen.getByLabelText('舞萌好友码').props.value).toBe('111111111111111');
    expect(screen.getByLabelText('上传到 水鱼玩家（水鱼查分器）').props.accessibilityState.checked).toBe(true);
    expect(screen.getByLabelText('选择好友码 222222222222222')).toBeTruthy();
    expect(mockSavePrefs).not.toHaveBeenCalled();
    mockFetchMe.mockResolvedValueOnce({ friendCode: '222222222222222', hasCabinetUserId: true });
    await fireEvent.press(screen.getByText('重试'));
    await waitFor(() => expect(screen.getByLabelText('舞萌好友码').props.value).toBe('222222222222222'));
    await waitFor(() => expect(mockSavePrefs).toHaveBeenCalledWith({ friendCode: '222222222222222', selectedAccountIds: [local.id], writeSelection: false }));
    expect(screen.getByLabelText('上传到 本地玩家（本地查分器）').props.accessibilityState.checked).toBe(true);
  });

  it('删除保存失败保留历史条目并用相同入口重试', async () => {
    setHubEntry({ friendCode: '111111111111111', token: 'tok-a', hasCabinetBound: false, updatedAt: 2 });
    const screen = await renderSheet([water.id]);
    await waitFor(() => expect(mockUpsert).toHaveBeenCalled());
    await fireEvent.press(screen.getByLabelText('选择已保存的 ScoreHub 好友码'));
    mockRemove.mockRejectedValueOnce(new SessionPersistenceError('local_commit'));
    await fireEvent.press(screen.getByLabelText('删除好友码 111111111111111'));
    expect(await screen.findByText('账号操作失败')).toBeTruthy();
    expect(screen.getByLabelText('选择好友码 111111111111111')).toBeTruthy();
    expect(mockRemoveSelection).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('重试'));
    await waitFor(() => expect(screen.queryByLabelText('选择好友码 111111111111111')).toBeNull());
    expect(mockRemoveSelection).toHaveBeenCalledWith('111111111111111');
  });

  it('验证后的本机存储故障显示固定错误并保留已保存账号', async () => {
    setHubEntry({ friendCode: '111111111111111', token: 'tok-a', hasCabinetBound: true, updatedAt: 2 });
    mockFetchMe.mockResolvedValue({ friendCode: '111111111111111', hasCabinetUserId: true });
    mockUpsert.mockRejectedValueOnce(new SessionPersistenceError('credential_storage'));
    const screen = await renderSheet([water.id]);
    expect(await screen.findByText('无法安全保存账号凭据，请重试；若仍失败，请查看诊断。')).toBeTruthy();
    expect(screen.getByLabelText('已保存舞萌账号')).toBeTruthy();
    expect(mockRemove).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('重试'));
    await waitFor(() => expect(mockUpsert).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('已保存舞萌账号')).toBeTruthy();
  });

  it('上传凭据读取失败不会按令牌过期回退好友码', async () => {
    setHubEntry({ friendCode: '111111111111111', token: 'tok-a', hasCabinetBound: true, updatedAt: 2 });
    mockFetchMe.mockResolvedValue({ friendCode: '111111111111111', hasCabinetUserId: true });
    mockUploadSession.mockRejectedValueOnce(new SessionPersistenceError('credential_storage'));
    const screen = await renderSheet([water.id]);
    await waitFor(() => expect(screen.getByLabelText('已保存舞萌账号')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('开始上传'));
    expect(await screen.findByText('无法安全保存账号凭据，请重试；若仍失败，请查看诊断。')).toBeTruthy();
    expect(mockUploadFriend).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
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

  it.each([
    ['file:///cache/ImagePicker/bind-qr.jpg', true],
    ['file:///documents/bind-qr.jpg', false],
    ['file:///cache-other/bind-qr.jpg', false],
    ['file:///cache/../documents/bind-qr.jpg', false],
    ['file:///cache/%2e%2e/documents/bind-qr.jpg', false],
    ['file:///cache/%2e%2e%2fdocuments/bind-qr.jpg', false],
  ] as const)('相册识码写入同步框且只清理 cache 副本：%s', async (assetUri, shouldDelete) => {
    setHubEntry({
      friendCode: '111111111111111',
      token: 'tok',
      hasCabinetBound: false,
      updatedAt: 1,
    });
    mockFetchMe.mockResolvedValue({ friendCode: '111111111111111', hasCabinetUserId: false });
    const imagePicker = jest.requireMock<typeof import('expo-image-picker')>('expo-image-picker');
    const decode = jest.requireMock<typeof import('@/services/maimai-qr-decode')>('@/services/maimai-qr-decode');
    (imagePicker.launchImageLibraryAsync as unknown as {
      mockResolvedValueOnce: (value: unknown) => void;
    }).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: assetUri, fileName: 'bind-qr.jpg' }],
    });
    (decode.decodeMaimaiQrFromImageUri as unknown as {
      mockResolvedValueOnce: (value: unknown) => void;
    }).mockResolvedValueOnce('SGWCMAIDBIND');

    const screen = await renderSheet([water.id], [local, water], true, 'qr');
    await fireEvent.press(screen.getByLabelText('从相册选择玩家二维码图片'));
    await waitFor(() => {
      expect(screen.getByLabelText('玩家二维码字符串').props.value).toBe('SGWCMAIDBIND');
    });
    expect(decode.decodeMaimaiQrFromImageUri).toHaveBeenCalledWith(assetUri, expect.any(AbortSignal));
    if (shouldDelete) expect(mockDeletePickedFile).toHaveBeenCalledWith(assetUri);
    else expect(mockDeletePickedFile).not.toHaveBeenCalled();
  });

  it('关闭后取消图片识别并忽略迟到结果', async () => {
    const imagePicker = jest.requireMock<typeof import('expo-image-picker')>('expo-image-picker');
    const decode = jest.requireMock<typeof import('@/services/maimai-qr-decode')>('@/services/maimai-qr-decode');
    jest.mocked(imagePicker.launchImageLibraryAsync).mockResolvedValueOnce({
      canceled: false, assets: [{ uri: 'file:///late-qr.jpg', width: 100, height: 100 }],
    });
    let resolveDecode!: (value: string) => void;
    jest.mocked(decode.decodeMaimaiQrFromImageUri).mockImplementationOnce(() => new Promise(resolve => { resolveDecode = resolve; }));
    const screen = await renderSheet([water.id], [local, water], true, 'qr');
    await fireEvent.press(screen.getByLabelText('从相册选择玩家二维码图片'));
    await waitFor(() => expect(resolveDecode).toBeDefined());
    const signal = jest.mocked(decode.decodeMaimaiQrFromImageUri).mock.calls.at(-1)?.[1];
    await fireEvent.press(screen.getByLabelText('关闭上传'));
    expect(signal?.aborted).toBe(true);
    await act(async () => { resolveDecode('SGWCMAIDLATE'); });
    expect(screen.getByLabelText('玩家二维码字符串').props.value).toBe('');
    expect(screen.queryByText('已识别二维码')).toBeNull();
    expect(uploadTaskController.getSnapshot().status).toBe('idle');
  });

  it('两个上传观察者同一帧开始时只建立一个全局任务', async () => {
    const first = await renderHook(() => useUploadTaskState(catalog));
    const second = await renderHook(() => useUploadTaskState(catalog));
    let firstSignal: unknown;
    let secondSignal: unknown;
    await act(async () => {
      firstSignal = first.result.current.begin();
      secondSignal = second.result.current.begin();
    });
    expect(firstSignal).toBe(uploadTaskController.getSignal());
    expect(secondSignal).toBeNull();
    expect(first.result.current.running).toBe(true);
    expect(second.result.current.running).toBe(true);
    await act(async () => uploadTaskController.cancel());
    await first.unmount();
    await second.unmount();
  });

  it('二维码同步不走好友申请并在任务接受后清空输入', async () => {
    mockUploadQr.mockImplementationOnce(async (input: MockUploadInput) => {
      input.onQrAccepted?.();
      input.onPhase({ kind: 'done', message: '完成', uploaded: 1, skipped: 0 });
      return { uploaded: 1, skipped: 0, failedAccountNames: [], targetResults: [], refreshedAccounts: [] };
    });
    const screen = await renderSheet([water.id], [local, water], true, 'qr');
    await screen.findByLabelText('玩家二维码字符串');
    await fireEvent.changeText(screen.getByLabelText('玩家二维码字符串'), 'SGWCMAIDCURRENT');
    await fireEvent.press(screen.getByLabelText('用二维码同步成绩'));

    await waitFor(() => expect(mockUploadQr).toHaveBeenCalledWith(expect.objectContaining({
      credential: { kind: 'text', qrCode: 'SGWCMAIDCURRENT' },
    })));
    await waitFor(() => expect(screen.getByLabelText('玩家二维码字符串').props.value).toBe(''));
    expect(mockUploadFriend).not.toHaveBeenCalled();
  });

  it('二维码上传在曲库为空时也先取得成绩再补曲库', async () => {
    const order: string[] = [];
    const requestCatalog = jest.fn(async () => {
      order.push('catalog');
      return catalog;
    });
    mockUploadQr.mockImplementationOnce(async (input: MockUploadInput) => {
      order.push('scores');
      input.onPhase({ kind: 'fetching_scores', message: '成绩已获取' });
      await input.resolveCatalog();
      order.push('upload');
      input.onPhase({ kind: 'done', message: '完成', uploaded: 1, skipped: 0 });
      return { uploaded: 1, skipped: 0, failedAccountNames: [], targetResults: [], refreshedAccounts: [] };
    });
    const screen = await renderSheet(
      [water.id],
      [local, water],
      true,
      'qr',
      null,
      requestCatalog,
    );
    await fireEvent.changeText(await screen.findByLabelText('玩家二维码字符串'), 'SGWCMAIDCURRENT');
    await fireEvent.press(screen.getByLabelText('用二维码同步成绩'));
    await waitFor(() => expect(order).toEqual(['scores', 'catalog', 'upload']));
    expect(mockUploadQr).toHaveBeenCalledTimes(1);
    expect(requestCatalog).toHaveBeenCalledTimes(1);
    expect(mockUploadFriend).not.toHaveBeenCalled();
  });

  it('关闭弹窗不中止二维码同步且会清空二维码', async () => {
    setHubEntry({
      friendCode: '111111111111111',
      token: 'tok',
      hasCabinetBound: false,
      updatedAt: 1,
    });
    mockFetchMe.mockResolvedValue({ friendCode: '111111111111111', hasCabinetUserId: false });
    let resolveQr: (() => void) | null = null;
    mockUploadQr.mockImplementationOnce((input: MockUploadInput) => new Promise((resolve) => {
      resolveQr = () => {
        input.onQrAccepted?.();
        input.onPhase({ kind: 'done', message: '完成', uploaded: 1, skipped: 0 });
        resolve({ uploaded: 1, skipped: 0, failedAccountNames: [], targetResults: [], refreshedAccounts: [] });
      };
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
          uploadMethod="qr"
        />
      </NotificationProvider>
    );

    const view = await render(renderVisible(true));
    await waitFor(() => expect(view.getByLabelText('玩家二维码字符串')).toBeTruthy());
    await fireEvent.changeText(view.getByLabelText('玩家二维码字符串'), 'SGWCMAIDBIND');
    await fireEvent.press(view.getByLabelText('用二维码同步成绩'));
    await waitFor(() => expect(mockUploadQr).toHaveBeenCalled());
    await waitFor(() => {
      expect(onPhaseChange).toHaveBeenCalledWith(expect.objectContaining({ kind: 'logging_in' }));
    });

    await fireEvent.press(view.getByLabelText('关闭上传'));
    expect(onClose).toHaveBeenCalled();
    expect(onPhaseChange).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'logging_in' }));

    await act(async () => {
      view.rerender(renderVisible(false));
    });
    await act(async () => {
      view.rerender(renderVisible(true));
    });

    await waitFor(() => expect(view.getByLabelText('取消当前操作')).toBeTruthy());
    await act(async () => {
      resolveQr?.();
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
      mockUploadQr.mockImplementationOnce(async (input: MockUploadInput) => {
        input.onQrAccepted?.();
        input.onPhase({ kind: 'done', message: '完成', uploaded: 1, skipped: 0 });
        return { uploaded: 1, skipped: 0, failedAccountNames: [], targetResults: [], refreshedAccounts: [] };
      });
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
            uploadMethod="qr"
          />
        </NotificationProvider>,
      );

      await waitFor(() => expect(view.getByLabelText('玩家二维码字符串')).toBeTruthy());
      await fireEvent.changeText(view.getByLabelText('玩家二维码字符串'), 'SGWCMAIDBIND');
      await fireEvent.press(view.getByLabelText('用二维码同步成绩'));
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

afterEach(() => { uploadTaskController.begin(); uploadTaskController.cancel(); });
