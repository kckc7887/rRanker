const native = vi.hoisted(() => ({
  picker: vi.fn(), available: vi.fn(), share: vi.fn(),
  create: vi.fn(), write: vi.fn(), read: vi.fn(), remove: vi.fn(),
  size: 10, exists: true,
}));

vi.mock('expo-document-picker', () => ({ getDocumentAsync: native.picker }));
vi.mock('expo-sharing', () => ({ isAvailableAsync: native.available, shareAsync: native.share }));
vi.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache' },
  File: class {
    uri = 'file:///cache/backup.json';
    create = native.create;
    write = native.write;
    text = native.read;
    delete = native.remove;
    get size() { return native.size; }
    get exists() { return native.exists; }
  },
}));

// Native Expo modules must be mocked before importing the service.
// eslint-disable-next-line import/first
import { createUserDataBackup } from '@/domain/user-library';
// eslint-disable-next-line import/first
import { MAX_BACKUP_FILE_BYTES, pickUserDataBackup, shareUserDataBackup } from '@/services/user-data-file-service';

describe('user data backup file service', () => {
  beforeEach(() => {
    vi.clearAllMocks(); native.size = 10; native.exists = true; native.available.mockResolvedValue(true);
    native.share.mockResolvedValue(undefined); native.remove.mockReturnValue(undefined);
  });

  it('shares a cache file and always removes it', async () => {
    await shareUserDataBackup(createUserDataBackup([], '2026-07-13T00:00:00.000Z'));
    expect(native.write).toHaveBeenCalledWith(expect.stringContaining('rranker-user-data'));
    expect(native.share).toHaveBeenCalledWith('file:///cache/backup.json', expect.objectContaining({ mimeType: 'application/json' }));
    expect(native.remove).toHaveBeenCalled();
  });

  it('rejects oversized and invalid backup files', async () => {
    native.picker.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///large.json', size: MAX_BACKUP_FILE_BYTES + 1 }] });
    await expect(pickUserDataBackup()).rejects.toThrow('1 MiB');
    expect(native.remove).toHaveBeenCalled();
    native.picker.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///bad.json', size: 5 }] });
    native.read.mockResolvedValueOnce('not-json');
    await expect(pickUserDataBackup()).rejects.toThrow('JSON');
  });

  it('does not create a file when system sharing is unavailable', async () => {
    native.available.mockResolvedValueOnce(false);
    await expect(shareUserDataBackup(createUserDataBackup([], '2026-07-13T00:00:00.000Z'))).rejects.toThrow('不支持系统分享');
    expect(native.create).not.toHaveBeenCalled();
  });

  it('returns null when the picker is canceled and validates strict content', async () => {
    native.picker.mockResolvedValueOnce({ canceled: true, assets: null });
    await expect(pickUserDataBackup()).resolves.toBeNull();
    const backup = createUserDataBackup([], '2026-07-13T00:00:00.000Z');
    native.picker.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///valid.json', size: 100 }] });
    native.read.mockResolvedValueOnce(JSON.stringify(backup));
    await expect(pickUserDataBackup()).resolves.toEqual(backup);
  });
});
