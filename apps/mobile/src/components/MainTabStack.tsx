import { Stack } from 'expo-router';

interface MainTabStackProps {
  title: string;
}

export function MainTabStack({ title }: MainTabStackProps) {
  return (
    <Stack
      screenOptions={{
        headerBackButtonDisplayMode: 'minimal',
        headerBackButtonMenuEnabled: false,
      }}
    >
      <Stack.Screen name="index" options={{ title }} />
    </Stack>
  );
}
