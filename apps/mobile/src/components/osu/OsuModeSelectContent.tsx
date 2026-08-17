import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  isOsuGameId,
  OSU_FAMILY,
  type OsuGameId,
} from '@/domain/game-mode-family';
import { getGameProfile } from '@/domain/game-profile';
import { useAppTheme } from '@/theme/app-theme';

const OSU_MODES: readonly OsuGameId[] = OSU_FAMILY.modeGameIds.filter(isOsuGameId);

/**
 * osu! 模式复选器（绑定页与 OAuth 回调页共用）：
 * 已绑定模式自动勾选且置灰不可取消；确认只返回本次新勾选的模式（只增不删）。
 */
export function OsuModeSelectContent({ alreadyBound, busy, submitLabel, onSubmit }: {
  alreadyBound: readonly OsuGameId[];
  busy: boolean;
  submitLabel: string;
  onSubmit: (selected: readonly OsuGameId[]) => void;
}) {
  const theme = useAppTheme();
  const [selected, setSelected] = useState<ReadonlySet<OsuGameId>>(new Set());
  const boundSet = new Set(alreadyBound);

  const toggle = (gameId: OsuGameId) => {
    if (boundSet.has(gameId) || busy) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(gameId)) next.delete(gameId);
      else next.add(gameId);
      return next;
    });
  };

  const canSubmit = !busy && selected.size > 0;

  return (
    <View style={styles.content}>
      <Text style={[styles.hint, { color: theme.textMuted }]}>
        仅绑定勾选的模式；已绑定模式不可在此解除（请到账号管理页操作）。
      </Text>
      <View style={styles.list}>
        {OSU_MODES.map((gameId) => {
          const checked = boundSet.has(gameId) || selected.has(gameId);
          const disabled = boundSet.has(gameId);
          return (
            <Pressable
              key={gameId}
              accessibilityRole="checkbox"
              accessibilityLabel={getGameProfile(gameId).title}
              accessibilityState={{ checked, disabled: disabled || busy }}
              disabled={disabled || busy}
              onPress={() => toggle(gameId)}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: theme.surfaceMuted, borderColor: theme.border },
                pressed && !disabled && styles.rowPressed,
                disabled && styles.rowDisabled,
              ]}
            >
              <Ionicons
                color={checked ? theme.accent : theme.textMuted}
                name={checked ? 'checkbox' : 'square-outline'}
                size={20}
              />
              <View style={styles.copy}>
                <Text style={[styles.name, { color: theme.text }]}>{getGameProfile(gameId).title}</Text>
                {disabled ? (
                  <Text style={[styles.state, { color: theme.textMuted }]}>已绑定</Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={submitLabel}
        accessibilityState={{ disabled: !canSubmit }}
        disabled={!canSubmit}
        onPress={() => onSubmit(OSU_MODES.filter((gameId) => selected.has(gameId)))}
        style={({ pressed }) => [
          styles.submit,
          { backgroundColor: theme.accent },
          pressed && canSubmit && styles.submitPressed,
          !canSubmit && styles.submitDisabled,
        ]}
      >
        <Text style={styles.submitText}>{busy ? '正在绑定…' : submitLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, paddingHorizontal: 16, paddingBottom: 24 },
  hint: { fontSize: 12, lineHeight: 17 },
  list: { gap: 8 },
  row: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowPressed: { opacity: 0.82 },
  rowDisabled: { opacity: 0.55 },
  copy: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '700' },
  state: { fontSize: 12 },
  submit: { borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  submitPressed: { opacity: 0.9 },
  submitDisabled: { opacity: 0.45 },
  submitText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
});
