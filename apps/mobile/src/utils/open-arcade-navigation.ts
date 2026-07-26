import { Linking, Platform } from 'react-native';
import {
  buildArcadeMapNavigateUri,
  type ArcadeMapAppId,
  type ArcadeNavigateTarget,
} from '@/domain/arcade-shops';

/** Open a specific map app. Returns false when the system cannot open the URL. */
export async function openArcadeMapApp(
  app: ArcadeMapAppId,
  shop: ArcadeNavigateTarget,
): Promise<boolean> {
  const uri = buildArcadeMapNavigateUri(app, shop, Platform.OS);
  try {
    await Linking.openURL(uri);
    return true;
  } catch {
    return false;
  }
}
