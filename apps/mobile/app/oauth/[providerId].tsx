import { useLocalSearchParams } from 'expo-router';
import { getDataSource, isPluginAvailable, usePluginRevision } from '@rranker/sdk/registry';
import { EmptyDataView } from '@rranker/sdk/components/EmptyDataView';

export default function OAuthCallbackScreen() {
  usePluginRevision();
  const { providerId } = useLocalSearchParams<{ providerId: string }>();
  const source = getDataSource(providerId);
  const Callback = source && isPluginAvailable(source.id) ? source.oauthCallback : undefined;
  return Callback ? <Callback /> : <EmptyDataView title="授权来源不可用" detail="请启用对应数据源后重新登录" />;
}
