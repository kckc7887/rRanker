import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { getGameDefinition, getPlugins, isPluginAvailable, isPluginEnabled, usePluginRevision, type Plugin } from '@rranker/sdk';
import { SettingsRow } from '@rranker/sdk/components/SettingsRow';
import { useNotification } from '@rranker/sdk/components/AppNotification';
import { useAppTheme } from '@rranker/sdk/theme/app-theme';
import { useDebugStore } from '@rranker/sdk/state/debug-store';
import { usePluginStore } from '@rranker/sdk/state/plugin-store';

const groups = [{ kind: 'game', title: '游戏适配器' }, { kind: 'provider', title: '数据源' }, { kind: 'tool', title: '工具' }] as const;

function targets(plugin: Plugin): readonly string[] {
  return plugin.kind === 'game' ? plugin.games.map(game => game.id) : plugin.gameIds;
}

function detail(plugin: Plugin): string {
  const games = targets(plugin);
  const unavailable = games.filter(gameId => !isPluginAvailable(plugin.id, gameId));
  const names = games.map(gameId => getGameDefinition(gameId)?.title ?? gameId).join('、');
  if (!isPluginEnabled(plugin.id)) return `已停用 · ${names}`;
  if (unavailable.length) return `${isPluginAvailable(plugin.id) ? '部分可用' : '依赖不可用'} · ${unavailable.map(id => getGameDefinition(id)?.title ?? id).join('、')}`;
  return `已启用 · ${names}`;
}

export default function PluginManagementScreen() {
  usePluginRevision();
  const theme = useAppTheme();
  const { showNotification } = useNotification();
  const examplesEnabled = useDebugStore(state => state.hydrated && state.testAccountsEnabled);
  const { hydrated, saving, error, hydrate, setEnabled } = usePluginStore();
  useEffect(() => { void hydrate().catch(() => undefined); }, [hydrate]);
  const plugins = getPlugins().filter(plugin => examplesEnabled || (plugin.kind !== 'provider' || plugin.bindingKind !== 'fixture')
    && targets(plugin).some(gameId => !getGameDefinition(gameId)?.fixture));
  const toggle = async (id: string, enabled: boolean) => {
    try { await setEnabled(id, enabled); }
    catch { showNotification({ title: '插件设置未保存', message: '请稍后重试。', variant: 'error' }); }
  };
  return <>
    <Stack.Screen options={{ title: '插件管理' }} />
    <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      {!hydrated && !error ? <ActivityIndicator color={theme.accent} /> : null}
      {error ? <SettingsRow title="读取失败" detail={error} onPress={() => { void hydrate().catch(() => undefined); }} /> : null}
      {groups.map(group => <View key={group.kind} style={styles.group}>
        <Text style={[styles.title, { color: theme.textSecondary }]}>{group.title}</Text>
        {plugins.filter(plugin => plugin.kind === group.kind).map(plugin => <SettingsRow key={plugin.id} title={plugin.title} detail={detail(plugin)}>
          <Switch value={isPluginEnabled(plugin.id)} disabled={!hydrated || saving} trackColor={{ true: theme.accent }}
            onValueChange={enabled => { void toggle(plugin.id, enabled); }} />
        </SettingsRow>)}
      </View>)}
    </ScrollView>
  </>;
}

const styles = StyleSheet.create({ content: { padding: 16, gap: 24 }, group: { gap: 10 }, title: { fontSize: 14, fontWeight: '600', paddingHorizontal: 4 } });
