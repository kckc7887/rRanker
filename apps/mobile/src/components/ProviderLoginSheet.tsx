import { ProviderIdentity } from '@/components/ProviderIdentity';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { LOCAL_MAIMAI_ACCOUNT_ID } from '@/domain/bound-account';
import type { GameId, ProviderOption } from '@/domain/game-bind-options';
import { resolveProviderLoginPanel } from '@/features/game-content/provider-login-panels';
import { providerLoginSheetStyles as styles } from '@/components/provider-login-sheet-styles';
import { useSession } from '@/state/session-store';
import { useAppTheme } from '@/theme/app-theme';
import { AppSheet } from '@/components/AppSheet';

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
  const [busy, setBusy] = useState(false);
  const boundMaimaiCount = useSession((s) => s.boundAccounts.filter(
    (account) => account.gameId === 'maimai' && account.id !== LOCAL_MAIMAI_ACCOUNT_ID,
  ).length);

  if (!provider) return null;

  const LoginPanel = resolveProviderLoginPanel(provider);

  return (
    <AppSheet visible={visible} onRequestClose={onClose} title="登录查分器"
      leftAction={{ label: '取消', accessibilityLabel: '关闭登录', onPress: onClose, disabled: busy }}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ProviderIdentity icon={provider.icon} title={provider.title} gameTitle={provider.id === 'osu' ? 'osu!（选择模式）' : gameTitle} />

        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <Text style={[styles.body, { color: theme.textSecondary }]}>绑定后，总览、最佳与成绩将使用该账号的远程数据。</Text>
          {boundMaimaiCount > 0 ? (
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
