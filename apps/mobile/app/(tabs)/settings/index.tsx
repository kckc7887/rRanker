import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { backupPreview } from '@/domain/user-library';
import type { RestoreMode, UserDataBackupV1 } from '@/domain/user-library';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';
import { useUserLibrary } from '@/hooks/use-user-library';
import { DivingFishAuthProvider } from '@/providers/diving-fish-auth';
import { DivingFishProvider } from '@/providers/diving-fish-provider';
import { ProviderError } from '@/providers/errors';
import type { ProviderSession } from '@/providers/contracts';
import { validateAndActivateSession } from '@/services/session-validation';
import { pickUserDataBackup, shareUserDataBackup, UserDataFileError } from '@/services/user-data-file-service';
import { SecureSessionStore } from '@/storage/secure-session-store';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { queryClient } from '@/state/query-client';
import { useSession } from '@/state/session-store';

const auth = new DivingFishAuthProvider();
const sessions = new SecureSessionStore();
const snapshots = new SqliteSnapshotRepository();

export default function SettingsScreen() {
  const session = useSession((s) => s.session);
  const setSession = useSession((s) => s.setSession);
  const clearSession = useSession((s) => s.clearSession);
  const restoreError = useSession((s) => s.restoreError);
  const library = useUserLibrary();
  const tabBottomInset = useNativeTabBottomInset();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [importToken, setImportToken] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const messageFor = (error: unknown) => error instanceof ProviderError ? error.message : '验证失败，请稍后重试';

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['score-snapshot'] });
    void queryClient.invalidateQueries({ queryKey: ['songs'] });
  };

  const clearRemoteCaches = () => {
    for (const key of ['score-snapshot', 'songs', 'detailed-catalog', 'plates']) {
      queryClient.removeQueries({ queryKey: [key] });
    }
  };

  const validateAndActivate = async (newSession: ProviderSession) => {
    const provider = new DivingFishProvider(newSession);
    try {
      await validateAndActivateSession(newSession, {
        createProvider: () => provider,
        save: (sessionToSave) => sessions.save(sessionToSave),
        activate: (sessionToActivate) => {
          setSession(sessionToActivate);
          invalidateAll();
        },
      });
    } catch (error) {
      if (newSession.mode === 'cookie-jar' && error instanceof ProviderError && error.code === 'authentication') {
        throw new ProviderError('authentication', '账号密码正确，但 iOS 未能携带登录 Cookie', false, { cause: error });
      }
      throw error;
    }
  };

  const login = async () => {
    if (!username.trim() || !password) { setMessage('请输入水鱼用户名和密码'); return; }
    setBusy(true); setMessage('正在验证登录态…');
    try {
      const newSession = await auth.loginWithPassword({ username: username.trim(), password });
      await validateAndActivate(newSession);
      setMessage(newSession.persistable ? '登录成功，凭据已安全保存' : '登录成功；Cookie 仅在当前会话有效');
    } catch (error) { setMessage(messageFor(error)); }
    finally { setPassword(''); setBusy(false); }
  };

  const connectWithToken = async () => {
    setBusy(true); setMessage('正在验证 Import-Token…');
    try {
      const newSession = auth.useImportToken(importToken);
      await validateAndActivate(newSession);
      setImportToken(''); setMessage('Import-Token 验证成功并已安全保存');
    } catch (error) { setMessage(messageFor(error)); }
    finally { setBusy(false); }
  };

  const clearLocalData = async (includePersonalData: boolean) => {
    setBusy(true);
    const failures: string[] = [];
    const attempt = async (label: string, action: () => Promise<unknown>) => {
      try { await action(); } catch { failures.push(label); }
    };
    // 两个 SQLite 仓储写入同一数据库，必须顺序清理，避免独占事务造成 database is locked。
    await attempt('凭据', () => sessions.clear());
    await attempt('缓存', () => snapshots.clear());
    if (includePersonalData) await attempt('个人数据', () => library.clearUserData());
    clearSession();
    clearRemoteCaches();
    setPassword(''); setImportToken('');
    if (failures.length > 0) setMessage(`部分清除失败（${failures.join('、')}），其余项目已清除，请重试`);
    else setMessage(includePersonalData ? '已清除本机凭据、缓存和个人数据' : '已清除本机凭据和缓存；个人数据已保留');
    setBusy(false);
  };

  const promptClear = () => Alert.alert('清除本机数据', '请选择是否同时删除收藏、练习清单和本地标签。', [
    { text: '取消', style: 'cancel' },
    { text: '仅凭据与缓存', onPress: () => void clearLocalData(false) },
    { text: '同时删除个人数据', style: 'destructive', onPress: () => void clearLocalData(true) },
  ]);

  const exportBackup = async () => {
    setBusy(true); setMessage('正在生成个人数据备份…');
    try {
      const backup = await library.createBackup();
      await shareUserDataBackup(backup);
      setMessage('已打开系统分享面板；请在目标应用中确认保存');
    } catch (error) {
      setMessage(error instanceof UserDataFileError ? error.message : '备份导出失败，请重试');
    } finally { setBusy(false); }
  };

  const applyBackup = async (backup: UserDataBackupV1, mode: RestoreMode) => {
    setBusy(true); setMessage(mode === 'merge' ? '正在合并个人数据…' : '正在替换个人数据…');
    try {
      await library.restoreBackup(backup, mode);
      setMessage(mode === 'merge' ? '个人数据已合并恢复' : '个人数据已替换恢复');
    } catch { setMessage('备份恢复失败，原有个人数据未修改'); }
    finally { setBusy(false); }
  };

  const importBackup = async () => {
    setBusy(true); setMessage('请选择 rRanker JSON 备份…');
    try {
      const backup = await pickUserDataBackup();
      if (!backup) { setMessage('已取消导入'); return; }
      const preview = backupPreview(backup);
      setMessage('备份已校验，等待确认恢复方式');
      Alert.alert('恢复个人数据', `歌曲 ${preview.songs} 项 · 谱面 ${preview.charts} 项 · 标签 ${preview.tags} 个`, [
        { text: '取消', style: 'cancel' },
        { text: '合并导入', onPress: () => void applyBackup(backup, 'merge') },
        { text: '替换现有数据', style: 'destructive', onPress: () => void applyBackup(backup, 'replace') },
      ]);
    } catch (error) {
      setMessage(error instanceof UserDataFileError ? error.message : '备份导入失败，请重试');
    } finally { setBusy(false); }
  };

  const sessionLabel = session ? '已登录（水鱼）' : '未登录（fixture 模式）';

  return <ScrollView
    style={styles.page}
    contentContainerStyle={[styles.content, { paddingBottom: tabBottomInset + 16 }]}
    keyboardShouldPersistTaps="handled"
    scrollIndicatorInsets={{ bottom: tabBottomInset }}
  >
    <View style={styles.card}>
      <Text style={styles.title}>水鱼账号</Text>
      <Text style={styles.state}>{sessionLabel}</Text>
      {restoreError ? <Text style={styles.error}>{restoreError}</Text> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <TextInput autoCapitalize="none" autoCorrect={false} textContentType="none" autoComplete="off" importantForAutofill="no" editable={!busy} placeholder="用户名" value={username} onChangeText={setUsername} style={styles.input} />
      <TextInput autoCapitalize="none" autoCorrect={false} textContentType="oneTimeCode" autoComplete="one-time-code" importantForAutofill="no" editable={!busy} placeholder="密码（不会保存）" secureTextEntry value={password} onChangeText={setPassword} style={styles.input} />
      <Pressable disabled={busy} onPress={() => void login()} style={styles.primary}><Text style={styles.primaryText}>账密登录并验证</Text></Pressable>
      <Text style={styles.or}>或</Text>
      <TextInput autoCapitalize="none" autoCorrect={false} textContentType="oneTimeCode" autoComplete="off" editable={!busy} placeholder="Import-Token" secureTextEntry value={importToken} onChangeText={setImportToken} style={styles.input} />
      <Text style={styles.hint}>Import-Token 可从水鱼查分器网页版个人设置获取</Text>
      <Pressable disabled={busy} onPress={() => void connectWithToken()} style={styles.secondary}><Text style={styles.secondaryText}>验证并保存 Token</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={promptClear}><Text style={styles.clear}>清除本机凭据和缓存</Text></Pressable>
    </View>
    <View style={styles.card}><Text style={styles.title}>个人数据</Text>
      <Text style={styles.body}>收藏、练习清单和标签保存在本机，不随水鱼登录切换。备份不包含凭据、成绩或曲库缓存。</Text>
      <Text style={styles.hint}>当前：{library.data?.filter((item) => item.kind === 'song' && item.favorite).length ?? 0} 首收藏 · {library.data?.filter((item) => item.kind === 'chart' && item.practice).length ?? 0} 张练习谱面</Text>
      <Pressable accessibilityRole="button" disabled={busy || library.isLoading} onPress={() => void exportBackup()} style={styles.secondary}><Text style={styles.secondaryText}>导出个人数据备份</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy || library.isLoading} onPress={() => void importBackup()} style={styles.secondary}><Text style={styles.secondaryText}>导入个人数据备份</Text></Pressable>
    </View>
    <View style={styles.card}><Text style={styles.title}>安全边界</Text>
      <Text style={styles.body}>密码仅用于当次登录请求；JWT/Import-Token 仅进入 SecureStore；成绩快照进入 SQLite。本应用不会生成或刷新 Import-Token。</Text></View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F8FA' }, content: { padding: 16, gap: 14 },
  card: { backgroundColor: '#FFF', borderRadius: 14, padding: 18, gap: 10 },
  title: { color: '#111827', fontSize: 18, fontWeight: '700' }, state: { color: '#246BFD', fontWeight: '600' },
  message: { color: '#4B5563', fontSize: 13 },
  error: { color: '#B42318', fontSize: 13 },
  body: { color: '#4B5563', lineHeight: 21 }, input: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, padding: 12, color: '#111827' },
  primary: { backgroundColor: '#246BFD', borderRadius: 10, padding: 13, alignItems: 'center' },
  primaryText: { color: '#FFF', fontWeight: '700' }, secondary: { borderWidth: 1, borderColor: '#246BFD', borderRadius: 10, padding: 13, alignItems: 'center' },
  secondaryText: { color: '#246BFD', fontWeight: '700' }, or: { color: '#9CA3AF', textAlign: 'center' },
  hint: { color: '#6B7280', fontSize: 12, lineHeight: 16 },
  clear: { color: '#B42318', textAlign: 'center', paddingTop: 4 },
});
