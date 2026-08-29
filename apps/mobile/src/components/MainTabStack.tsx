import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useAppTheme } from '@/theme/app-theme';

interface MainTabStackProps {
  title: string;
}

export function MainTabStack({ title }: MainTabStackProps) {
  const theme = useAppTheme();
  return (
    <View
      collapsable={false}
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <Stack
        screenOptions={{
          headerBackButtonDisplayMode: 'minimal',
          headerBackButtonMenuEnabled: false,
        }}
      >
        <Stack.Screen name="index" options={{ title }} />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
});
