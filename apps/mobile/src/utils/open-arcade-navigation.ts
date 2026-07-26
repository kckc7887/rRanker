import { Alert, Linking, Platform } from 'react-native';
import {
  buildArcadeMapNavigateUri,
  listArcadeMapApps,
  resolveArcadeNavigateDestination,
  type ArcadeMapAppId,
  type ArcadeNavigateTarget,
} from '@/domain/arcade-shops';

function mapAppLabel(app: ArcadeMapAppId): string {
  return listArcadeMapApps('ios').find((item) => item.id === app)?.label
    ?? listArcadeMapApps('android').find((item) => item.id === app)?.label
    ?? '地图';
}

export async function openArcadeMapApp(
  app: ArcadeMapAppId,
  shop: ArcadeNavigateTarget,
): Promise<void> {
  const uri = buildArcadeMapNavigateUri(app, shop, Platform.OS);
  try {
    await Linking.openURL(uri);
  } catch {
    Alert.alert('无法打开地图', `请确认已安装${mapAppLabel(app)}。`);
  }
}

/** Show a chooser, then open the selected map app with the shop address. */
export function openArcadeNavigation(shop: ArcadeNavigateTarget): void {
  const destination = resolveArcadeNavigateDestination(shop);
  const apps = listArcadeMapApps(Platform.OS);
  Alert.alert(
    '选择地图',
    destination,
    [
      ...apps.map((app) => ({
        text: app.label,
        onPress: () => {
          void openArcadeMapApp(app.id, shop);
        },
      })),
      { text: '取消', style: 'cancel' as const },
    ],
    { cancelable: true },
  );
}
