import { useEffect } from 'react';
import { RemoteImage as ExpoImage } from '@rranker/sdk/components/RemoteImage';
import { Image, StyleSheet, View, type ImageStyle } from 'react-native';
import { findGame, findProvider, type GameId, type ProviderId } from '@rranker/sdk/domain/game-bind-options';
import { useSession } from '@rranker/sdk/state/session-store';
import { hydrateAccountSummary } from '@rranker/sdk/services/account-hydration';

function fallbackIcon(account: { gameId: GameId; providerId: ProviderId | null }) {
  return account.providerId
    ? findProvider(account.providerId)?.icon ?? findGame(account.gameId)?.icon
    : findGame(account.gameId)?.icon;
}

export function BoundAccountAvatar({
  accountId,
  style,
}: {
  accountId: string;
  style: ImageStyle;
}) {
  const account = useSession((state) => state.boundAccounts.find((item) => item.id === accountId));
  const boundId = account?.id;
  const credentialId = account?.credentialId;
  useEffect(() => {
    if (!boundId || useSession.getState().boundAccounts.find(item => item.id === boundId)?.avatarUrl) return;
    const controller = new AbortController();
    void hydrateAccountSummary(boundId, controller.signal).catch(() => undefined);
    return () => controller.abort();
  }, [boundId, credentialId]);

  if (!account) return null;

  const borderRadius = typeof style.borderRadius === 'number' ? style.borderRadius : 10;
  const icon = fallbackIcon(account);

  if (account.avatarUrl) {
    return (
      <ExpoImage
        accessibilityIgnoresInvertColors
        cacheProfile="native"
        contentFit="cover"
        source={account.avatarUrl}
        style={[styles.avatar, style]}
        transition={120}
      />
    );
  }

  if (icon) {
    return <Image source={icon} style={style} />;
  }

  return <View style={[styles.placeholder, style, { borderRadius }]} />;
}

const styles = StyleSheet.create({
  avatar: {
    backgroundColor: '#E5E7EB',
  },
  placeholder: {
    backgroundColor: '#E5E7EB',
  },
});
