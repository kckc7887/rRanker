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

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/storage/upload-prefs-store', () => ({
  uploadPrefsStore: {
    load: () => mockLoadPrefs(),
    save: (prefs: TestUploadPrefs) => mockSavePrefs(prefs),
  },
}));

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
    mockLoadPrefs.mockResolvedValue({
      friendCode: '111111111111111',
      selectedAccountIds: [water.id],
    });
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
    const testBox = screen.getByLabelText(/上传到 .*测试查分器/);
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
    expect(screen.getByTestId('app-notification-modal').props.presentationStyle)
      .toBe('overFullScreen');
  });
});
