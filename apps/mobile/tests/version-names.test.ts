import { VERSION_NAME_MAPPINGS } from '@/domain/version-names';

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
});
