import { Stack } from 'expo-router';
import { useNavigationTransitionListeners } from '@/hooks/use-navigation-transition-listeners';

interface MainTabStackProps {
  title: string;
}

export function MainTabStack({ title }: MainTabStackProps) {
  const screenListeners = useNavigationTransitionListeners();
  return (
    <Stack
      screenListeners={screenListeners}
      screenOptions={{
        headerBackButtonDisplayMode: 'minimal',
        headerBackButtonMenuEnabled: false,
      }}
    >
      <Stack.Screen name="index" options={{ title }} />
    </Stack>
  );
}
