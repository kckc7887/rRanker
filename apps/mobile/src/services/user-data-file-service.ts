import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { assertUserDataBackupExportable, MAX_BACKUP_FILE_BYTES, parseUserDataBackup } from '@/domain/user-library';
import type { UserDataBackup } from '@/domain/user-library';

export { MAX_BACKUP_FILE_BYTES };

export class UserDataFileError extends Error {}

export async function shareUserDataBackup(backup: UserDataBackup): Promise<void> {
  try { assertUserDataBackupExportable(backup); }
  catch (error) { throw new UserDataFileError(error instanceof Error ? error.message : '备份无法导出'); }
  if (!await Sharing.isAvailableAsync()) throw new UserDataFileError('当前设备不支持系统分享');
  const stamp = backup.exportedAt.replace(/[-:]/gu, '').replace(/\.\d{3}Z$/u, 'Z');
  const file = new File(Paths.cache, `rRanker-backup-${stamp}.json`);
  try {
    file.create({ overwrite: true });
    file.write(`${JSON.stringify(backup, null, 2)}\n`);
    await Sharing.shareAsync(file.uri, { dialogTitle: '导出 rRanker 个人数据', mimeType: 'application/json', UTI: 'public.json' });
  } finally {
    if (file.exists) file.delete();
  }
}

export async function pickUserDataBackup(): Promise<UserDataBackup | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) throw new UserDataFileError('没有读取到备份文件');
  const file = new File(asset.uri);
  try {
    if (asset.size !== undefined && asset.size > MAX_BACKUP_FILE_BYTES) throw new UserDataFileError('备份文件超过可导入的大小上限');
    if (file.size > MAX_BACKUP_FILE_BYTES) throw new UserDataFileError('备份文件超过可导入的大小上限');
    const text = await file.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_FILE_BYTES) throw new UserDataFileError('备份文件超过可导入的大小上限');
    let value: unknown;
    try { value = JSON.parse(text); }
    catch { throw new UserDataFileError('备份文件不是有效的 JSON'); }
    try { return parseUserDataBackup(value); }
    catch { throw new UserDataFileError('备份版本或内容无效'); }
  } finally {
    if (file.exists) file.delete();
  }
}
