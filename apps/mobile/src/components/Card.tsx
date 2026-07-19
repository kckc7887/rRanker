import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { useAppTheme } from '@/theme/app-theme';

export interface CardProps {
  children: ReactNode;
  style?: ViewStyle;
  testID?: string;
}

export function Card({ children, style, testID }: CardProps) {
  const theme = useAppTheme();
  return <View testID={testID} style={[styles.card, { backgroundColor: theme.surface }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    padding: 18,
  },
});
