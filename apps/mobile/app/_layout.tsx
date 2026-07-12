import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { queryClient } from '@/state/query-client';

export const unstable_settings = { anchor: '(tabs)' };
export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <Stack><Stack.Screen name="(tabs)" options={{ headerShown: false }} /></Stack>
      <StatusBar style="dark" />
    </QueryClientProvider>
  );
}
