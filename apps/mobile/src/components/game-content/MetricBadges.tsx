import { StyleSheet, Text, View } from 'react-native';

export function DualTextMetricBadge({ label, valueText, colors, showLabel = true, showConstant = true }: {
  label: string; valueText: string; colors: { bg: string; fg: string }; showLabel?: boolean; showConstant?: boolean;
}) {
  return (
    <View
      accessibilityLabel={`${label}，定数 ${valueText}`}
      style={[styles.badge, { backgroundColor: colors.bg }]}
    >
      {showLabel ? <Text style={[styles.label, { color: colors.fg }]}>{label}</Text> : null}
      {showConstant ? (
        <Text style={[
          styles.constant,
          !showLabel && styles.constantOnly,
          { color: colors.fg },
        ]}>
          {valueText}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4 },
  label: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  constant: { fontSize: 9, fontWeight: '700', opacity: 0.7 },
  constantOnly: { fontWeight: '800', opacity: 1 },
});

export function StatusMetricBadge({ text, colors, raised }: {
  text: string; colors: { bg: string; fg: string }; raised?: boolean;
}) {
  return (
    <View style={[statusStyles.rateBadge, { backgroundColor: colors.bg }]}>
      <Text style={raised === undefined ? [statusStyles.rateText, { color: colors.fg }] : [
        statusStyles.rateText,
        { color: colors.fg },
        raised && statusStyles.rateTextPhi,
      ]}
      >
        {text}
      </Text>
    </View>
  );
}

const statusStyles = StyleSheet.create({
  rateBadge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    minHeight: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rateText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '900',
    letterSpacing: 0.3,
    includeFontPadding: false,
    textAlign: 'center',
  },
  rateTextPhi: { transform: [{ translateY: -1.5 }] },
});
