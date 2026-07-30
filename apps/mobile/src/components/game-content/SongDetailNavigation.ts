import { router, type Href } from 'expo-router';

const SONG_LIST_HREF = '/(tabs)/search' as Href;

export function navigateBackFromSongDetail(): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }

  router.replace(SONG_LIST_HREF);
}
