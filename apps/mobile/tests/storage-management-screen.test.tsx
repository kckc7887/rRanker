import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { StorageManagementScreen } from '@/screens/StorageManagementScreen';
import type { StorageUsageReport } from '@/features/storage-management/storage-usage';

const mockNotify = jest.fn();
const mockClear = jest.fn(async (_ids: unknown) => ({
  clearedIds: ['shared'], failures: [] as string[], reclaimedBytes: 2048,
}));
const mockSave = jest.fn(async (_value: unknown) => undefined);
const mockLoad = jest.fn(async () => ({ version: 1 as const, selectedIds: ['shared' as const] }));
const mockCollect = jest.fn<() => Promise<StorageUsageReport>>();

const usage: StorageUsageReport = {
  totalBytes: 4096,
  clearableBytes: 3072,
  precision: 'estimated' as const,
  sqliteAllocatedBytes: 4096,
  sqliteReclaimableBytes: 1024,
  groups: [
    {
      id: 'basic' as const,
      title: '基本数据',
      bytes: 1024,
      color: '#999',
      items: [
        { id: 'app', title: '账号与个人内容', bytes: 128, clearableBytes: 0, precision: 'estimated' as const, clearable: false, clearCategoryId: null, color: '#999' },
        { id: 'basic-other', title: '设置和其它数据', bytes: 896, clearableBytes: 0, precision: 'estimated' as const, clearable: false, clearCategoryId: null, color: '#aaa' },
      ],
    },
    {
      id: 'cache' as const,
      title: '缓存数据',
      bytes: 3072,
      color: '#00f',
      items: [
        { id: 'maimai', title: '舞萌 DX', bytes: 1024, clearableBytes: 1024, precision: 'estimated' as const, clearable: true, clearCategoryId: 'maimai' as const, color: '#f00' },
        { id: 'shared', title: '其它缓存', bytes: 2048, clearableBytes: 2048, precision: 'estimated' as const, clearable: true, clearCategoryId: 'shared' as const, color: '#00f' },
      ],
    },
  ],
};

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('@/components/StorageDonutChart', () => ({ StorageDonutChart: () => null }));
jest.mock('@/components/AppNotification', () => ({ useNotification: () => ({ showNotification: mockNotify }) }));
jest.mock('@/features/storage-management/storage-usage', () => ({
  collectStorageUsage: () => mockCollect(),
  listClearableCategoryIds: () => ['maimai', 'shared'],
}));
jest.mock('@/features/storage-management/clear-storage-cache', () => ({
  clearStorageByCategories: (ids: unknown) => mockClear(ids),
}));
jest.mock('@/storage/storage-clear-prefs-store', () => ({ storageClearPreferencesStore: {
  load: () => mockLoad(),
  save: (value: unknown) => mockSave(value),
} }));
jest.mock('@/theme/app-theme', () => ({ useAppTheme: () => ({
  background: '#fff', surface: '#fff', text: '#111', textMuted: '#666', textSecondary: '#444',
  border: '#ddd', accent: '#246BFD',
}) }));

describe('StorageManagementScreen', () => {
  beforeEach(() => {
    mockNotify.mockClear();
    mockClear.mockReset().mockResolvedValue({ clearedIds: ['shared'], failures: [], reclaimedBytes: 2048 });
    mockSave.mockClear();
    mockLoad.mockClear();
    mockCollect.mockReset().mockResolvedValue(usage);
  });

  it('shows two collapsed groups without storage implementation details', async () => {
    render(<StorageManagementScreen />);
    await waitFor(() => expect(screen.getByText('可清理约')).toBeTruthy());
    expect(screen.getAllByText('3.0 KB').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('基本数据，1.0 KB').props.accessibilityState).toEqual({ expanded: false });
    expect(screen.getByLabelText('缓存数据，3.0 KB').props.accessibilityState).toEqual({ expanded: false });
    expect(screen.queryByText('账号与个人内容')).toBeNull();
    expect(screen.queryByLabelText('舞萌 DX缓存')).toBeNull();
    expect(screen.queryByText('受管存储')).toBeNull();
    expect(screen.queryByText(/SQLite|数据库|逻辑估算|自动保存/u)).toBeNull();
  });

  it('reports measured reclaimed bytes after a successful clear', async () => {
    render(<StorageManagementScreen />);
    await waitFor(() => expect(screen.getByText('缓存数据')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('缓存数据，3.0 KB'));
    await waitFor(() => expect(screen.getByLabelText('清除已选缓存')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('清除已选缓存'));
    await waitFor(() => expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({
      title: '清除完成',
      message: expect.stringContaining('已释放 2.0 KB'),
      variant: 'success',
    })));
    expect(mockClear).toHaveBeenCalledWith(['shared']);
  });

  it('keeps partial success and lists failed categories', async () => {
    mockClear.mockResolvedValueOnce({ clearedIds: ['shared'], failures: ['舞萌 DX'], reclaimedBytes: 1024 });
    render(<StorageManagementScreen />);
    await waitFor(() => expect(screen.getByText('缓存数据')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('缓存数据，3.0 KB'));
    await waitFor(() => expect(screen.getByLabelText('清除已选缓存')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('清除已选缓存'));
    await waitFor(() => expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({
      title: '部分清除失败',
      message: expect.stringContaining('部分项目未能清除，请重试'),
      variant: 'warning',
    })));
  });

  it('persists the same checkbox configuration used by quick clear', async () => {
    render(<StorageManagementScreen />);
    await waitFor(() => expect(screen.getByText('缓存数据')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('缓存数据，3.0 KB'));
    await waitFor(() => expect(screen.getByLabelText('舞萌 DX缓存')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('舞萌 DX缓存'));
    await waitFor(() => expect(mockSave).toHaveBeenCalledWith({ version: 1, selectedIds: ['shared', 'maimai'] }));
  });

  it('supports select all and cancel all in the expanded cache group', async () => {
    render(<StorageManagementScreen />);
    await waitFor(() => expect(screen.getByText('缓存数据')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('缓存数据，3.0 KB'));
    await waitFor(() => expect(screen.getByText('全选')).toBeTruthy());
    fireEvent.press(screen.getByText('全选'));
    await waitFor(() => expect(mockSave).toHaveBeenCalledWith({ version: 1, selectedIds: ['maimai', 'shared'] }));
    fireEvent.press(screen.getByText('取消全选'));
    await waitFor(() => expect(mockSave).toHaveBeenCalledWith({ version: 1, selectedIds: [] }));
  });

  it('shows a retry action when storage statistics fail', async () => {
    mockCollect.mockRejectedValueOnce(new Error('failed')).mockResolvedValueOnce(usage);
    render(<StorageManagementScreen />);
    await waitFor(() => expect(screen.getByText('暂时无法统计占用')).toBeTruthy());
    fireEvent.press(screen.getByText('重新统计'));
    await waitFor(() => expect(screen.getByText('缓存数据')).toBeTruthy());
    expect(mockCollect).toHaveBeenCalledTimes(2);
  });

  it('shows an empty state when the application has no measured data', async () => {
    mockCollect.mockResolvedValueOnce({
      ...usage,
      totalBytes: 0,
      clearableBytes: 0,
      groups: usage.groups.map((group) => ({ ...group, bytes: 0, items: [] })),
    });
    render(<StorageManagementScreen />);
    await waitFor(() => expect(screen.getByText('暂无可显示的存储数据')).toBeTruthy());
  });
});
