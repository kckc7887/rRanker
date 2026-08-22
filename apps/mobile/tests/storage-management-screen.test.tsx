import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { StorageManagementScreen } from '@/screens/StorageManagementScreen';

const mockNotify = jest.fn();
const mockClear = jest.fn(async (_ids: unknown) => ({
  clearedIds: ['shared'], failures: [] as string[], reclaimedBytes: 2048,
}));
const mockSave = jest.fn(async (_value: unknown) => undefined);
const mockLoad = jest.fn(async () => ({ version: 1 as const, selectedIds: ['shared' as const] }));

const usage = {
  totalBytes: 3200,
  clearableBytes: 3072,
  precision: 'estimated' as const,
  sqliteAllocatedBytes: 4096,
  sqliteReclaimableBytes: 1024,
  segments: [
    { id: 'app', title: '个人数据', bytes: 128, precision: 'estimated' as const, clearable: false, clearCategoryId: null, color: '#999' },
    { id: 'maimai', title: '舞萌 DX', bytes: 1024, precision: 'estimated' as const, clearable: true, clearCategoryId: 'maimai' as const, color: '#f00', note: 'SQLite 为估算值' },
    { id: 'shared', title: '共享缓存', bytes: 2048, precision: 'exact' as const, clearable: true, clearCategoryId: 'shared' as const, color: '#00f', note: '会话临时文件' },
  ],
};

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('@/components/StorageDonutChart', () => ({ StorageDonutChart: () => null }));
jest.mock('@/components/AppNotification', () => ({ useNotification: () => ({ showNotification: mockNotify }) }));
jest.mock('@/features/storage-management/storage-usage', () => ({
  collectStorageUsage: async () => usage,
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
  });

  it('shows clearable estimate and explicitly labels SQLite estimates', async () => {
    render(<StorageManagementScreen />);
    await waitFor(() => expect(screen.getByText('可清理约')).toBeTruthy());
    expect(screen.getByText('3.0 KB')).toBeTruthy();
    expect(screen.getByText(/当前数据库分配页约 4.0 KB/u)).toBeTruthy();
    expect(screen.getByText(/其中可回收空闲页约 1.0 KB/u)).toBeTruthy();
  });

  it('reports measured reclaimed bytes after a successful clear', async () => {
    render(<StorageManagementScreen />);
    await waitFor(() => expect(screen.getByLabelText('清除缓存')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('清除缓存'));
    await waitFor(() => expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({
      title: '清除完成',
      message: expect.stringContaining('实际释放 2.0 KB'),
      variant: 'success',
    })));
    expect(mockClear).toHaveBeenCalledWith(['shared']);
  });

  it('keeps partial success and lists failed categories', async () => {
    mockClear.mockResolvedValueOnce({ clearedIds: ['shared'], failures: ['舞萌 DX'], reclaimedBytes: 1024 });
    render(<StorageManagementScreen />);
    await waitFor(() => expect(screen.getByLabelText('清除缓存')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('清除缓存'));
    await waitFor(() => expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({
      title: '部分清除失败',
      message: expect.stringContaining('失败：舞萌 DX'),
      variant: 'warning',
    })));
  });

  it('persists the same checkbox configuration used by quick clear', async () => {
    render(<StorageManagementScreen />);
    await waitFor(() => expect(screen.getByLabelText('舞萌 DX缓存')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('舞萌 DX缓存'));
    await waitFor(() => expect(mockSave).toHaveBeenCalledWith({ version: 1, selectedIds: ['shared', 'maimai'] }));
  });
});
