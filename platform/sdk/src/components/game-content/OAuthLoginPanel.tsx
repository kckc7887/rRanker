import { Pressable, Text, View } from 'react-native';
import { providerLoginSheetStyles as styles } from '@rranker/sdk/components/provider-login-sheet-styles';
import { useAppTheme } from '@rranker/sdk/theme/app-theme';

type AccountOption = { id: string; name: string; detail: string; onPress: () => void };

export function OAuthLoginPanel({ provider, authorizeLabel, hint, message, busy, onAuthorize, accounts, expanded, onToggle }: {
  provider: string; authorizeLabel: string; hint: string; message: string; busy: boolean;
  onAuthorize: () => void; accounts: readonly AccountOption[]; expanded: boolean; onToggle: () => void;
}) {
  const theme = useAppTheme();
  const reuseLabel = '使用已有' + provider + '账号';
  return <>
    {message ? <Text style={[styles.message, { color: theme.textSecondary }]}>{message}</Text> : null}
    <Pressable disabled={busy} onPress={onAuthorize}
      style={({ pressed }) => [styles.primary, { backgroundColor: theme.accent }, pressed && styles.primaryPressed]}>
      <Text style={[styles.primaryText, { color: theme.onAccent }]}>{authorizeLabel}</Text>
    </Pressable>
    <Text style={[styles.hint, { color: theme.textMuted }]}>{hint}</Text>
    {accounts.length > 0 && <View style={[styles.reuseSection, { borderTopColor: theme.border }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={reuseLabel} disabled={busy} onPress={onToggle}
        style={({ pressed }) => [styles.secondary, { borderColor: theme.accent }, pressed && { backgroundColor: theme.accentSoft }]}>
        <Text style={[styles.secondaryText, { color: theme.accent }]}>{reuseLabel}</Text>
      </Pressable>
      {expanded && <View style={styles.reuseList}>
        {accounts.map(account => <Pressable key={account.id} accessibilityRole="button" accessibilityLabel={reuseLabel + ' ' + account.name}
          disabled={busy} onPress={account.onPress} style={({ pressed }) => [
            styles.reuseAccount, { backgroundColor: pressed ? theme.accentSoft : theme.surfaceMuted, borderColor: theme.border },
          ]}>
          <Text style={[styles.reuseName, { color: theme.text }]}>{account.name}</Text>
          <Text style={[styles.hint, { color: theme.textMuted }]}>{account.detail}</Text>
        </Pressable>)}
      </View>}
    </View>}
  </>;
}
