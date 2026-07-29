import { Platform } from 'react-native';

export function songDetailScreenOptions() {
  return {
    title: '',
    headerTransparent: true,
    headerShadowVisible: false,
    headerTintColor: '#FFFFFF',
    headerStyle: { backgroundColor: 'transparent' },
    headerBackground: () => null,
    headerShown: Platform.OS !== 'android',
    headerBackVisible: false,
    headerLeft: () => null,
    headerRight: () => null,
  } as const;
}
