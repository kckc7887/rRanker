import { useModalDismissal } from '@/hooks/use-modal-close-action';
import { useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LOCAL_MAIMAI_ACCOUNT_ID } from '@/domain/bound-account';
import type { GameId, ProviderOption } from '@/domain/game-bind-options';
import { DivingFishLoginPanel } from '@/components/maimai/DivingFishLoginPanel';
import { LxnsLoginPanel } from '@/components/LxnsLoginPanel';
import { PhigrosLoginPanel } from '@/components/phigros/PhigrosLoginPanel';
import { OsuLoginPanel } from '@/components/osu/OsuLoginPanel';
import { providerLoginSheetStyles as styles } from '@/components/provider-login-sheet-styles';
import { useSession } from '@/state/session-store';
import { useAppTheme } from '@/theme/app-theme';

export function ProviderLoginSheet({
  visible,
  provider,
  gameId,
  gameTitle,
  onClose,
  onDismiss,
  onSuccess,
}: {
  visible: boolean;
  provider: ProviderOption | null;
  gameId: GameId;
  gameTitle: string;
  onClose: () => void;
  onDismiss?: () => void;
  onSuccess: () => void;
}) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const handleDismiss = useModalDismissal(visible, onDismiss);
  const [busy, setBusy] = useState(false);
  const boundMaimaiCount = useSession((s) => s.boundAccounts.filter(
    (account) => account.gameId === 'maimai' && account.id !== LOCAL_MAIMAI_ACCOUNT_ID,
  ).length);

  if (!provider) return null;

  const close = () => {
    onClose();
  };

  const bindingKind = provider.bindingKind;
  const isOsu = provider.id === 'osu';

  return (
    <Modal
      onDismiss={handleDismiss}
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <View style={[styles.root, { paddingBottom: Math.max(insets.bottom, 12), backgroundColor: theme.background }]}>
        <View style={[styles.grabber, { backgroundColor: theme.border }]} />
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭登录"
            hitSlop={12}
            disabled={busy}
            onPress={close}
            style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
          >
            <Text style={[styles.close, { color: theme.accent }]}>取消</Text>
          </Pressable>
          <Text style={[styles.title, { color: theme.text }]}>登录查分器</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.identity}>
            <Image source={provider.icon} style={styles.icon} />
            <Text style={[styles.providerName, { color: theme.text }]}>{provider.title}</Text>
            <Text style={[styles.gameLine, { color: theme.textMuted }]}>
              用于绑定 {isOsu ? 'osu!（选择模式）' : gameTitle}
            </Text>
          </View>

          <View style={[styles.card, { backgroundColor: theme.surface }]}>
            <Text style={[styles.body, { color: theme.textSecondary }]}>绑定后，总览、最佳与成绩将使用该账号的远程数据。</Text>
            {boundMaimaiCount > 0 ? (
              <Text style={styles.hint}>可同时保存多个查分器账号；同一玩家再次登录会更新该账号凭据。</Text>
            ) : null}
            {bindingKind === 'device-code' ? (
              <PhigrosLoginPanel visible={visible} onSuccess={onSuccess} onBusyChange={setBusy} />
            ) : bindingKind === 'oauth-code' && isOsu ? (
              <OsuLoginPanel visible={visible} onSuccess={onSuccess} onBusyChange={setBusy} />
            ) : bindingKind === 'oauth-code' ? (
              <LxnsLoginPanel
                visible={visible}
                gameId={gameId}
                gameTitle={gameTitle}
                onSuccess={onSuccess}
                onBusyChange={setBusy}
              />
            ) : (
              <DivingFishLoginPanel visible={visible} onSuccess={onSuccess} onBusyChange={setBusy} />
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
