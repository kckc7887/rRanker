import type { ReactNode } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { View, type StyleProp, type ViewStyle } from 'react-native';

type GameChartResultCardProps = {
  children: ReactNode;
  style: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
  gradient?: {
    colors: readonly [string, string, ...string[]];
    start?: { x: number; y: number };
    end?: { x: number; y: number };
  };
  beforeContent?: ReactNode;
};

export function GameChartResultCard({
  children,
  style,
  testID,
  accessibilityLabel,
  gradient,
  beforeContent,
}: GameChartResultCardProps) {
  if (gradient) {
    return (
      <LinearGradient
        accessibilityLabel={accessibilityLabel}
        colors={gradient.colors}
        end={gradient.end}
        start={gradient.start}
        style={style}
        testID={testID}
      >
        {beforeContent}
        {children}
      </LinearGradient>
    );
  }

  return (
    <View accessibilityLabel={accessibilityLabel} style={style} testID={testID}>
      {beforeContent}
      {children}
    </View>
  );
}
