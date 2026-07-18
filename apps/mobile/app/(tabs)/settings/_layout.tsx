import { Stack } from 'expo-router';

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerBackButtonDisplayMode: 'minimal',
        headerBackButtonMenuEnabled: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: '设置' }} />
    </Stack>
  );
}
