import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { DivingFishAuthProvider } from '@/providers/diving-fish-auth';
import { DivingFishProvider } from '@/providers/diving-fish-provider';
import { ProviderError } from '@/providers/errors';
import { SecureSessionStore } from '@/storage/secure-session-store';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

const auth = new DivingFishAuthProvider();
const sessions = new SecureSessionStore();
const snapshots = new SqliteSnapshotRepository();

export default function SettingsScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [importToken, setImportToken] = useState('');
  const [status, setStatus] = useState('未登录 · fixture 模式');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void sessions.load().then((session) => {
      if (session) setStatus(session.mode === 'jwt' ? '已恢复水鱼登录凭据' : '已恢复 Import-Token');
    });
  }, []);

  const messageFor = (error: unknown) => error instanceof ProviderError ? error.message : '验证失败，请稍后重试';

  const login = async () => {
    if (!username.trim() || !password) { setStatus('请输入水鱼用户名和密码'); return; }
    setBusy(true); setStatus('正在验证登录态…');
    try {
      const session = await auth.loginWithPassword({ username: username.trim(), password });
      const provider = new DivingFishProvider(session);
      await Promise.all([provider.getPlayer(), provider.getRecords()]);
      await sessions.save(session);
      setStatus(session.persistable ? '登录成功，凭据已安全保存' : '登录成功；Cookie 仅在当前会话有效');
    } catch (error) { setStatus(messageFor(error)); }
    finally { setPassword(''); setBusy(false); }
  };

  const connectWithToken = async () => {
    setBusy(true); setStatus('正在验证 Import-Token…');
    try {
      const session = auth.useImportToken(importToken);
      await new DivingFishProvider(session).getRecords();
      await sessions.save(session);
      setImportToken(''); setStatus('Import-Token 验证成功并已安全保存');
    } catch (error) { setStatus(messageFor(error)); }
    finally { setBusy(false); }
  };

  const clearLocalData = async () => {
    setBusy(true);
    try {
      await Promise.all([sessions.clear(), snapshots.clear()]);
      setPassword(''); setImportToken(''); setStatus('已清除本机凭据和成绩快照');
    } catch { setStatus('清除失败，请重试'); }
    finally { setBusy(false); }
  };

  return <View style={styles.page}>
    <View style={styles.card}><Text style={styles.title}>水鱼账号</Text><Text style={styles.state}>{status}</Text>
      <TextInput autoCapitalize="none" autoCorrect={false} editable={!busy} placeholder="用户名" value={username} onChangeText={setUsername} style={styles.input} />
      <TextInput autoCapitalize="none" autoCorrect={false} editable={!busy} placeholder="密码（不会保存）" secureTextEntry value={password} onChangeText={setPassword} style={styles.input} />
      <Pressable disabled={busy} onPress={() => void login()} style={styles.primary}><Text style={styles.primaryText}>账密登录并验证</Text></Pressable>
      <Text style={styles.or}>或</Text>
      <TextInput autoCapitalize="none" autoCorrect={false} editable={!busy} placeholder="Import-Token" secureTextEntry value={importToken} onChangeText={setImportToken} style={styles.input} />
      <Pressable disabled={busy} onPress={() => void connectWithToken()} style={styles.secondary}><Text style={styles.secondaryText}>验证并保存 Token</Text></Pressable>
      <Pressable disabled={busy} onPress={() => void clearLocalData()}><Text style={styles.clear}>清除本机凭据和缓存</Text></Pressable>
    </View>
    <View style={styles.card}><Text style={styles.title}>安全边界</Text>
      <Text style={styles.body}>密码仅用于当次登录请求；JWT/Import-Token 仅进入 SecureStore；成绩快照进入 SQLite。本应用不会生成或刷新 Import-Token。</Text></View>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: 16, gap: 14, backgroundColor: '#F7F8FA' },
  card: { backgroundColor: '#FFF', borderRadius: 14, padding: 18, gap: 10 },
  title: { color: '#111827', fontSize: 18, fontWeight: '700' }, state: { color: '#246BFD', fontWeight: '600' },
  body: { color: '#4B5563', lineHeight: 21 }, input: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, padding: 12, color: '#111827' },
  primary: { backgroundColor: '#246BFD', borderRadius: 10, padding: 13, alignItems: 'center' },
  primaryText: { color: '#FFF', fontWeight: '700' }, secondary: { borderWidth: 1, borderColor: '#246BFD', borderRadius: 10, padding: 13, alignItems: 'center' },
  secondaryText: { color: '#246BFD', fontWeight: '700' }, or: { color: '#9CA3AF', textAlign: 'center' }, clear: { color: '#B42318', textAlign: 'center', paddingTop: 4 },
});
