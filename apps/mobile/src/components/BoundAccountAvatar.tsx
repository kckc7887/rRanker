import { useEffect } from 'react';
import { Image as ExpoImage } from 'expo-image';
import { Image, StyleSheet, View, type ImageStyle } from 'react-native';
import { findGame, findProvider, type GameId, type ProviderId } from '@/domain/game-bind-options';
import { useSession } from '@/state/session-store';
import { syncAllAccountAvatars } from '@/services/resolve-account-avatar';

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
  const sessionsByAccountId = useSession((state) => state.sessionsByAccountId);
  const updateBoundAccountScore = useSession((state) => state.updateBoundAccountScore);

  useEffect(() => {
    if (!account) return;
    if (account.avatarUrl) return;
    if (account.providerId !== 'lxns' && account.providerId !== 'phi-taptap') return;

    void syncAllAccountAvatars(
      [account],
      sessionsByAccountId,
      (id, avatarUrl) => {
        const current = useSession.getState().boundAccounts.find((item) => item.id === id);
        if (!current) return;
        updateBoundAccountScore(
          id,
          current.scoreDisplay,
          current.displayName,
          avatarUrl,
        );
      },
    );
  }, [
    account,
    account?.avatarUrl,
    account?.displayName,
    account?.id,
    account?.providerId,
    account?.scoreDisplay,
    sessionsByAccountId,
    updateBoundAccountScore,
  ]);

  if (!account) return null;

  const borderRadius = typeof style.borderRadius === 'number' ? style.borderRadius : 10;
  const icon = fallbackIcon(account);

  if (account.avatarUrl) {
    return (
      <ExpoImage
        accessibilityIgnoresInvertColors
        cachePolicy="disk"
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
