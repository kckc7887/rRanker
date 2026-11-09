import { SegmentedControl } from '@/components/SegmentedControl';

export type MaimaiUploadPage = 'friend_code' | 'qr' | 'lxns_guide';

const methods = [
  { id: 'friend_code', label: '好友码', accessibilityLabel: '切换到好友码页面' },
  { id: 'qr', label: '玩家二维码', accessibilityLabel: '切换到玩家二维码页面' },
  { id: 'lxns_guide', label: '同步引导', accessibilityLabel: '切换到同步引导页面' },
] as const;

export function MaimaiUploadTabs({
  value,
  disabled,
  onChange,
}: {
  value: MaimaiUploadPage;
  disabled: boolean;
  onChange: (value: MaimaiUploadPage) => void;
}) {
  return <SegmentedControl label="舞萌上传方式" options={methods} value={value} disabled={disabled} onChange={onChange}
    style={{ marginHorizontal: 20, marginBottom: 12 }} />;
}
