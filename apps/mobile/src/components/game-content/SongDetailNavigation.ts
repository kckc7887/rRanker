import { useCallback } from 'react';
import { router, useNavigation, type Href } from 'expo-router';

const SONG_LIST_HREF = '/(tabs)/search' as Href;

export function useSongDetailBackNavigation(): () => void {
  const navigation = useNavigation();

  return useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    router.replace(SONG_LIST_HREF);
  }, [navigation]);
}
