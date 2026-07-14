import { localizedVersionName, VERSION_NAME_MAPPINGS } from '@/domain/version-names';
import { missingVersionLogoIds, VERSION_IDS_WITH_LOGOS } from '@/domain/version-logos';

describe('Chinese and Japanese version names', () => {
  it('maps current PRiSM PLUS to 舞萌DX 2026', () => {
    expect(VERSION_NAME_MAPPINGS.find((item) => item.versionId === 25500)).toEqual({
      versionId: 25500,
      china: '舞萌DX 2026',
      japan: 'maimai でらっくす PRiSM PLUS',
    });
  });
  it('keeps one unique mapping for every verified LXNS version id', () => {
    expect(new Set(VERSION_NAME_MAPPINGS.map((item) => item.versionId)).size).toBe(VERSION_NAME_MAPPINGS.length);
    expect(VERSION_NAME_MAPPINGS).toHaveLength(20);
  });

  it('switches names by id and falls back to the current name for old caches', () => {
    expect(localizedVersionName(25500, '舞萌DX 2026', 'japan')).toBe('maimai でらっくす PRiSM PLUS');
    expect(localizedVersionName(15007, '15007', 'china')).toBe('ORANGE PLUS');
    expect(localizedVersionName(15007, '15007', 'japan')).toBe('maimai ORANGE PLUS');
    expect(localizedVersionName(undefined, '舞萌DX 2026', 'japan')).toBe('maimai でらっくす PRiSM PLUS');
    expect(localizedVersionName(undefined, '未来版本', 'japan')).toBe('未来版本');
    expect(localizedVersionName(26000, '26000', 'japan')).toBe('26000');
  });

  it('covers every mapped version with packaged logo slots', () => {
    expect(missingVersionLogoIds()).toEqual([]);
    expect(VERSION_IDS_WITH_LOGOS).toHaveLength(VERSION_NAME_MAPPINGS.length);
  });
});
