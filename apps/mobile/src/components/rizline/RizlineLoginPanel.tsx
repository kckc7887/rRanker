import { useState } from 'react';
import { SmsLoginPanel } from '@/components/game-content/SmsLoginPanel';
import { createRizlineBoundAccount } from '@/domain/bound-account';
import { RizlineProvider } from '@/providers/rizline-provider';
import { SecureSessionStore } from '@/storage/secure-session-store';
import { useSession } from '@/state/session-store';
import { queryClient } from '@/state/query-client';
import { persistBoundAccountThumbnail } from '@/services/account-thumbnail';
import { cancelBoundAccountQueries } from '@/screens/game-accounts-actions';
import { cacheRizlineSave } from '@/services/rizline-service';
import { captureResourceWrites } from '@/services/snapshot-cache-utils';

const validatePhone = (phone: string) => /^1\d{10}$/u.test(phone);

export function RizlineLoginPanel(props: { visible: boolean; onSuccess: () => void; onBusyChange: (busy: boolean) => void }) {
  const [provider] = useState(() => new RizlineProvider());
  const login = async (phone: string, code: string, signal: AbortSignal) => {
    const assertGameCurrent = captureResourceWrites('rizline', signal);
    const { session, player, save } = await provider.login(phone, code, signal);
    assertGameCurrent();
    const account = createRizlineBoundAccount(player);
    const cancelling = cancelBoundAccountQueries(account, queryClient);
    const assertCurrent = captureResourceWrites('rizline', signal, account.id);
    await cancelling;
    assertCurrent();
    const credentialId = await new SecureSessionStore().upsertAccount({ id: account.id,
      gameId: 'rizline', providerId: 'rizline-official', displayName: player.username,
      scoreDisplay: account.scoreDisplay, session }, signal);
    assertCurrent();
    useSession.getState().setSession(session, { gameId: 'rizline', providerId: 'rizline-official',
      accountId: account.id, playerId: player.userId, displayName: player.username,
      rating: player.totalRks, credentialId });
    await cacheRizlineSave(account.id, save, signal);
    assertCurrent();
    void persistBoundAccountThumbnail(account.id, { scoreDisplay: account.scoreDisplay }).catch(() => undefined);
    await queryClient.invalidateQueries({ queryKey: ['game-data'] });
  };
  return <SmsLoginPanel {...props} validatePhone={validatePhone} cooldownKey="rizline-official"
    sendCode={(phone, signal) => provider.sendVerificationCode(phone, signal)} login={login} />;
}
