import { localizedVersionName } from '@/domain/version-names';

describe('Chinese and Japanese version names', () => {
  it('按名称或版本区间切换语言，未知版本保留输入名称', () => {
    expect(localizedVersionName(25500, '舞萌DX 2026', 'japan')).toBe('maimai でらっくす PRiSM PLUS');
    expect(localizedVersionName(15007, '15007', 'china')).toBe('ORANGE PLUS');
    expect(localizedVersionName(15007, '15007', 'japan')).toBe('maimai ORANGE PLUS');
    expect(localizedVersionName(undefined, '舞萌DX 2026', 'japan')).toBe('maimai でらっくす PRiSM PLUS');
    expect(localizedVersionName(undefined, '未来版本', 'japan')).toBe('未来版本');
    expect(localizedVersionName(26000, '26000', 'japan')).toBe('26000');
  });
});
