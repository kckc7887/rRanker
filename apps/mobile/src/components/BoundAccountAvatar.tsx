import { useState } from 'react';
import { Image, type ImageStyle, StyleSheet } from 'react-native';
import type { BoundAccount } from '@/domain/bound-account';
import { findGame, findProvider } from '@/domain/game-bind-options';

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
  const [failed, setFailed] = useState(false);
  const icon = fallbackIcon(account);

  if (account.avatarUrl && !failed) {
    return (
      <Image
        accessibilityIgnoresInvertColors
        source={{ uri: account.avatarUrl }}
        style={[styles.avatar, style]}
        onError={() => setFailed(true)}
      />
    );
  }

  if (icon) {
    return <Image source={icon} style={style} />;
  }

  return null;
}

const styles = StyleSheet.create({
  avatar: {
    backgroundColor: '#E5E7EB',
  },
});
