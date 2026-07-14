import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ViewStyle } from 'react-native';

export interface CardProps {
  children: ReactNode;
  style?: ViewStyle;
  testID?: string;
}

export function Card({ children, style, testID }: CardProps) {
  return <View testID={testID} style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
  },
});
