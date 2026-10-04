import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

export interface GameDifficultyBadgeTheme {
  background: string;
  border: string;
  text: string;
}

type GameDifficultyBadgeProps = {
  text: string;
  theme: GameDifficultyBadgeTheme;
  accessibilityLabel?: string;
  special?: {
    gradient: readonly [string, string, ...string[]];
    textColor?: string;
  };
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  testID?: string;
};

export function GameDifficultyBadge({ text, theme, accessibilityLabel, special, style, textStyle, testID }: GameDifficultyBadgeProps) {
  const label = <Text numberOfLines={1} style={[styles.text, { color: special?.textColor ?? theme.text }, textStyle]}>{text}</Text>;
  if (special) {
    return (
      <LinearGradient accessibilityLabel={accessibilityLabel} colors={special.gradient}
        end={{ x: 1, y: 0.5 }} start={{ x: 0, y: 0.5 }} style={[styles.badge, style]} testID={testID}>
        <View pointerEvents="none" style={styles.specialOverlay} />
        {label}
      </LinearGradient>
    );
  }
  return (
    <View accessibilityLabel={accessibilityLabel}
      style={[styles.badge, { backgroundColor: theme.background, borderColor: theme.border }, style]} testID={testID}>
      {label}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { minWidth: 32, height: 24, borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  specialOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(20,14,38,0.24)' },
  text: { fontSize: 9, fontWeight: '900', letterSpacing: 0.25 },
});
