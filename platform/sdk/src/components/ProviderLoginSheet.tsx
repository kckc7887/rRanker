import { ProviderIdentity } from '@rranker/sdk/components/ProviderIdentity';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { GameId, ProviderOption } from '@rranker/sdk/domain/game-bind-options';
import { getDataSource, isPluginAvailable, usePluginRevision } from '@rranker/sdk/registry';
import { providerLoginSheetStyles as styles } from '@rranker/sdk/components/provider-login-sheet-styles';
import { useSession } from '@rranker/sdk/state/session-store';
import { useAppTheme } from '@rranker/sdk/theme/app-theme';
import { AppSheet } from '@rranker/sdk/components/AppSheet';

export function ProviderLoginSheet({
  visible,
  provider,
  gameId,
  gameTitle,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  provider: ProviderOption | null;
  gameId: GameId;
  gameTitle: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const theme = useAppTheme();
  usePluginRevision();
  const [busy, setBusy] = useState(false);
  const boundAccountCount = useSession((s) => s.boundAccounts.filter(account => account.gameId === gameId).length);

  if (!provider) return null;

  const source = getDataSource(provider.id);
  if (!source || !isPluginAvailable(source.id, gameId)) return null;
  const BindingSheet = source?.bindingSheet;
  if (BindingSheet) return <BindingSheet visible={visible} gameId={gameId} gameTitle={gameTitle}
    onClose={onClose} onSuccess={onSuccess} onBusyChange={setBusy} />;
  const LoginPanel = source?.loginPanel;
  if (!LoginPanel) return null;

  return (
    <AppSheet visible={visible} onRequestClose={onClose} title="登录查分器"
      leftAction={{ label: '取消', accessibilityLabel: '关闭登录', onPress: onClose, disabled: busy }}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ProviderIdentity icon={provider.icon} title={provider.title} gameTitle={gameTitle} />

        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <Text style={[styles.body, { color: theme.textSecondary }]}>绑定后，总览、最佳与成绩将使用该账号的远程数据。</Text>
          {boundAccountCount > 0 ? (
            <Text style={[styles.hint, { color: theme.textMuted }]}>可同时保存多个查分器账号；同一玩家再次登录会更新该账号凭据。</Text>
          ) : null}
          <LoginPanel
            visible={visible}
            gameId={gameId}
            gameTitle={gameTitle}
            onSuccess={onSuccess}
            onBusyChange={setBusy}
          />
        </View>
      </ScrollView>
    </AppSheet>
  );
}
