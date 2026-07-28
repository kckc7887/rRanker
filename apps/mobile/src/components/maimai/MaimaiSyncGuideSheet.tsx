import {
  LXNS_PROXY_ADDRESS,
  LXNS_PROXY_PORT,
  LXNS_PROXY_SERVER,
  LxnsSyncGuideContent,
  LxnsSyncGuideSheet,
} from '@/components/LxnsSyncGuideSheet';
import {
  isMaimaiMaintenanceWindow,
  MAIMAI_MAINTENANCE_MESSAGE,
} from '@/domain/maimai-maintenance';

export const MAIMAI_PROXY_SERVER = LXNS_PROXY_SERVER;
export const MAIMAI_PROXY_PORT = LXNS_PROXY_PORT;
export const MAIMAI_PROXY_ADDRESS = LXNS_PROXY_ADDRESS;
export const MAIMAI_OFFLINE_SYNC_URL = 'https://maimai.lxns.net/api/v0/maimai/wechat/auth';

export function MaimaiSyncGuideSheet({
  visible,
  syncing,
  onClose,
  onSync,
}: {
  visible: boolean;
  syncing: boolean;
  onClose: () => void;
  onSync: () => Promise<boolean>;
}) {
  return (
    <LxnsSyncGuideSheet
      visible={visible}
      syncing={syncing}
      gameName="舞萌"
      shortGameName="舞萌"
      offlineSyncUrl={MAIMAI_OFFLINE_SYNC_URL}
      testID="maimai-sync-guide-root"
      isMaintenanceWindow={isMaimaiMaintenanceWindow}
      maintenanceMessage={MAIMAI_MAINTENANCE_MESSAGE}
      onClose={onClose}
      onSync={onSync}
    />
  );
}

export function MaimaiSyncGuideContent({
  syncing,
  onClose,
  onSync,
}: {
  syncing: boolean;
  onClose: () => void;
  onSync: () => Promise<boolean>;
}) {
  return (
    <LxnsSyncGuideContent
      syncing={syncing}
      shortGameName="舞萌"
      offlineSyncUrl={MAIMAI_OFFLINE_SYNC_URL}
      isMaintenanceWindow={isMaimaiMaintenanceWindow}
      maintenanceMessage={MAIMAI_MAINTENANCE_MESSAGE}
      onClose={onClose}
      onSync={onSync}
    />
  );
}
