import type { ReactNode } from 'react';
import { LinearGradient, type LinearGradientProps } from 'expo-linear-gradient';
import { type StyleProp, type TextStyle, type ViewStyle, Text, View } from 'react-native';

export function SongDetailHero({
  size,
  style,
  cover,
  placeholderStyle,
  placeholderNoteStyle,
  shadeColors,
  shadeStyle,
  copyStyle,
  children,
}: {
  size: number;
  style: StyleProp<ViewStyle>;
  cover?: ReactNode;
  placeholderStyle: StyleProp<ViewStyle>;
  placeholderNoteStyle: StyleProp<TextStyle>;
  shadeColors: LinearGradientProps['colors'];
  shadeStyle: StyleProp<ViewStyle>;
  copyStyle: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  return (
    <View style={[style, { width: size, height: size }]}>
      {cover ?? (
        <View style={placeholderStyle}>
          <Text style={placeholderNoteStyle}>♪</Text>
        </View>
      )}
      <LinearGradient
        colors={shadeColors}
        locations={[0, 1]}
        pointerEvents="none"
        style={shadeStyle}
      />
      <View style={copyStyle}>{children}</View>
    </View>
  );
}
