import { Pressable, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { useAppTheme } from '@rranker/sdk/theme/app-theme';
import { gameToolHref, usePluginRevision } from '@rranker/sdk';
import { useSession } from '@rranker/sdk/state/session-store';

export function BestImageEntryButton({
  label,
  accessibilityLabel = label,
  testID,
}: {
  label: string;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const theme = useAppTheme();
  usePluginRevision();
  const gameId = useSession(state => state.activeGameId);
  const href = gameToolHref(gameId, 'best-image');
  if (!href) return null;
  return <Pressable accessibilityLabel={accessibilityLabel} accessibilityRole="button" onPress={() => router.push(href)}
    style={[styles.button, { backgroundColor: theme.accent }]} testID={testID}>
    <Text style={[styles.text, { color: theme.onAccent }]}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  button: { minHeight: 46, borderRadius: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#246BFD' },
  text: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
