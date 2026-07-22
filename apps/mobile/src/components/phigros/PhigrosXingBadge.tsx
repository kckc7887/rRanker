import { StyleSheet, Text, View } from 'react-native';
import { phigrosXingLabel, type PhigrosXingKind } from '@/domain/phigros-xing';

/** XING 标签主题色（GOOD / MISS 共用橙色） */
export const PHIGROS_XING_COLORS = {
  bg: '#FFF7ED',
  fg: '#EA580C',
} as const;

export function PhigrosXingBadge({ kind }: { kind: PhigrosXingKind }) {
  return (
    <View style={[styles.badge, { backgroundColor: PHIGROS_XING_COLORS.bg }]}>
      <Text style={[styles.text, { color: PHIGROS_XING_COLORS.fg }]}>
        {phigrosXingLabel(kind)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    minHeight: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '900',
    letterSpacing: 0.3,
    includeFontPadding: false,
    textAlign: 'center',
  },
});
