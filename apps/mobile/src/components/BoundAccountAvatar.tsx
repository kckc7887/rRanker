import { useState } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, View, type ImageStyle } from 'react-native';
import type { BoundAccount } from '@/domain/bound-account';
import { findGame, findProvider } from '@/domain/game-bind-options';
import { useBoundAccountAvatarUrl } from '@/hooks/use-bound-account-avatar-url';

function fallbackIcon(account: BoundAccount) {
  return account.providerId
    ? findProvider(account.providerId)?.icon ?? findGame(account.gameId)?.icon
    : findGame(account.gameId)?.icon;
}

export function BoundAccountAvatar({
  account,
  style,
}: {
  account: BoundAccount;
  style: ImageStyle;
}) {
  const resolvedUrl = useBoundAccountAvatarUrl(account);
  const [failed, setFailed] = useState(false);
  const icon = fallbackIcon(account);
  const borderRadius = typeof style.borderRadius === 'number' ? style.borderRadius : 10;

  if (resolvedUrl && !failed) {
    return (
      <Image
        accessibilityIgnoresInvertColors
        cachePolicy="disk"
        contentFit="cover"
        source={resolvedUrl}
        style={[styles.avatar, style]}
        transition={120}
        onError={() => setFailed(true)}
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
