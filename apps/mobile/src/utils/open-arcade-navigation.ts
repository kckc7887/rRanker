import { Linking, Platform } from 'react-native';
import type {
  ActionNotificationInput,
  NotificationInput,
} from '@/components/AppNotification';
import {
  buildArcadeMapNavigateUri,
  listArcadeMapApps,
  resolveArcadeNavigateDestination,
  type ArcadeMapAppId,
  type ArcadeNavigateTarget,
} from '@/domain/arcade-shops';

type NotificationApi = {
  showActionNotification: (input: ActionNotificationInput) => number;
  showNotification: (input: NotificationInput) => number;
};

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

/** Present the app action dialog for choosing a map, then open the selected app. */
export function openArcadeNavigation(
  shop: ArcadeNavigateTarget,
  notify: NotificationApi,
): void {
  const destination = resolveArcadeNavigateDestination(shop);
  const apps = listArcadeMapApps(Platform.OS);
  notify.showActionNotification({
    title: '选择地图',
    message: destination,
    variant: 'info',
    actions: [
      ...apps.map((app) => ({
        label: app.label,
        onPress: async () => {
          const opened = await openArcadeMapApp(app.id, shop);
          if (!opened) {
            notify.showNotification({
              title: '无法打开地图',
              message: `请确认已安装${app.label}。`,
              variant: 'warning',
            });
          }
        },
      })),
      { label: '取消', tone: 'cancel' as const },
    ],
  });
}
