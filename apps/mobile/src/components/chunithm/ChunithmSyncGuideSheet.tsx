import {
  LXNS_PROXY_ADDRESS,
  LXNS_PROXY_PORT,
  LXNS_PROXY_SERVER,
  LxnsSyncGuideSheet,
} from '@/components/LxnsSyncGuideSheet';
import {
  CHUNITHM_MAINTENANCE_MESSAGE,
  isChunithmMaintenanceWindow,
} from '@/domain/chunithm-maintenance';

export const CHUNITHM_PROXY_SERVER = LXNS_PROXY_SERVER;
export const CHUNITHM_PROXY_PORT = LXNS_PROXY_PORT;
export const CHUNITHM_PROXY_ADDRESS = LXNS_PROXY_ADDRESS;
export const CHUNITHM_OFFLINE_SYNC_URL = 'https://maimai.lxns.net/api/v0/chunithm/wechat/auth';

export function ChunithmSyncGuideSheet({
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
      gameName="中二"
      shortGameName="中二"
      offlineSyncUrl={CHUNITHM_OFFLINE_SYNC_URL}
      testID="chunithm-sync-guide-root"
      isMaintenanceWindow={isChunithmMaintenanceWindow}
      maintenanceMessage={CHUNITHM_MAINTENANCE_MESSAGE}
      onClose={onClose}
      onSync={onSync}
    />
  );
}
