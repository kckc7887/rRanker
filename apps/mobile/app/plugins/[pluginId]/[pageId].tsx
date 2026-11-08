import { Stack, useLocalSearchParams } from 'expo-router';
import { getPlugin, getPluginPage, usePluginRevision, type DetailParams } from '@rranker/sdk';
import { StackScreenActivityScope } from '@rranker/sdk/components/CachedTabScreen';
import { EmptyDataView } from '@rranker/sdk/components/EmptyDataView';

export default function PluginScreen() {
  usePluginRevision();
  const route = useLocalSearchParams<Record<string, string | string[]>>();
  const params: DetailParams = Object.fromEntries(Object.entries(route).map(([key, value]) => [
    key, Array.isArray(value) ? value[0] ?? '' : value,
  ]));
  const { pluginId, pageId, gameId, accountId } = params;
  const Page = getPluginPage(pluginId, pageId, gameId);
  return <StackScreenActivityScope>
    <Stack.Screen options={{ title: getPlugin(pluginId)?.title ?? '插件' }} />
    {Page ? <Page key={`${pluginId}:${pageId}:${gameId ?? ''}:${accountId ?? ''}`}
      gameId={gameId} accountId={accountId} params={params} />
      : <EmptyDataView title="工具不可用" detail="请在插件管理中启用工具和对应游戏适配器" />}
  </StackScreenActivityScope>;
}
