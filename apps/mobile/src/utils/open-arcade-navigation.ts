import { Linking, Platform } from 'react-native';
import {
  buildAndroidAmapNavigateUri,
  buildAppleMapsNavigateUri,
  buildGeoNavigateUri,
  buildIosAmapNavigateUri,
  type ArcadeShop,
} from '@/domain/arcade-shops';

export async function openArcadeNavigation(
  shop: Pick<ArcadeShop, 'name' | 'latitude' | 'longitude'>,
): Promise<void> {
  if (Platform.OS === 'ios') {
    try {
      await Linking.openURL(buildIosAmapNavigateUri(shop));
      return;
    } catch {
      await Linking.openURL(buildAppleMapsNavigateUri(shop));
      return;
    }
  }

  if (Platform.OS === 'android') {
    try {
      await Linking.openURL(buildAndroidAmapNavigateUri(shop));
      return;
    } catch {
      await Linking.openURL(buildGeoNavigateUri(shop));
      return;
    }
  }

  await Linking.openURL(buildAppleMapsNavigateUri(shop));
}
