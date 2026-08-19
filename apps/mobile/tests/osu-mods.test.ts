import {
  OSU_MOD_THEME_BY_TYPE,
  OSU_MOD_TYPE_BY_ACRONYM,
  osuModIconFileName,
  resolveOsuModTheme,
} from '@/domain/osu-mods';

describe('osu! 模组元数据映射', () => {
  it('覆盖 67 个模组（66 个 UserPlayable + SV2）', () => {
    expect(Object.keys(OSU_MOD_TYPE_BY_ACRONYM)).toHaveLength(67);
  });

  it('acronym → 类型分组与 mods.json（四规则集 UserPlayable + SV2）一致', () => {
    const group = (type: string) => Object.entries(OSU_MOD_TYPE_BY_ACRONYM)
      .filter(([, value]) => value === type)
      .map(([acronym]) => acronym)
      .sort();
    expect(group('DifficultyReduction')).toEqual(['DC', 'EZ', 'HT', 'NF', 'NR', 'SR']);
    expect(group('DifficultyIncrease')).toEqual([
      'AC', 'BL', 'CO', 'DT', 'FI', 'FL', 'HD', 'HR', 'NC', 'PF', 'SD', 'ST', 'TC',
    ]);
    expect(group('Conversion')).toEqual([
      '10K', '1K', '2K', '3K', '4K', '5K', '6K', '7K', '8K', '9K',
      'AL', 'CL', 'CS', 'DA', 'DS', 'HO', 'IN', 'MR', 'RD', 'SG', 'SW', 'TP',
    ]);
    expect(group('Automation')).toEqual(['AP', 'RX', 'SO']);
    expect(group('Fun')).toEqual([
      'AD', 'AS', 'BM', 'BR', 'BU', 'DF', 'DP', 'FF', 'FR', 'GR',
      'MF', 'MG', 'MU', 'NS', 'RP', 'SI', 'SY', 'TR', 'WD', 'WG', 'WU',
    ]);
    expect(group('System')).toEqual(['SV2', 'TD']);
  });

  it('六类配色完整（背景 = osu-web 官方模组色，前景 = color-mix black 10%）', () => {
    expect(OSU_MOD_THEME_BY_TYPE).toEqual({
      DifficultyReduction: { background: '#B3FF66', foreground: '#3C591E' },
      DifficultyIncrease: { background: '#FF6666', foreground: '#591E1E' },
      Conversion: { background: '#8C66FF', foreground: '#2D1E59' },
      Automation: { background: '#66CCFF', foreground: '#1E4659' },
      Fun: { background: '#FF66AB', foreground: '#591E39' },
      System: { background: '#FFCC22', foreground: '#594605' },
    });
  });

  it('图标文件名 = acronym 小写 + .svg（含 SV2 与 mania 键数系列）', () => {
    expect(osuModIconFileName('DT')).toBe('dt.svg');
    expect(osuModIconFileName('HD')).toBe('hd.svg');
    expect(osuModIconFileName('SV2')).toBe('sv2.svg');
    expect(osuModIconFileName('10K')).toBe('10k.svg');
  });

  it('resolveOsuModTheme：已知模组返回类型色，未知 acronym 返回 null', () => {
    // HD/DT 增难红、EZ 降难绿、RX 自动化蓝、CL 转换紫、TD/SV2 系统黄
    expect(resolveOsuModTheme('HD')).toEqual({ background: '#FF6666', foreground: '#591E1E' });
    expect(resolveOsuModTheme('EZ')).toEqual({ background: '#B3FF66', foreground: '#3C591E' });
    expect(resolveOsuModTheme('RX')).toEqual({ background: '#66CCFF', foreground: '#1E4659' });
    expect(resolveOsuModTheme('CL')).toEqual({ background: '#8C66FF', foreground: '#2D1E59' });
    expect(resolveOsuModTheme('TD')).toEqual({ background: '#FFCC22', foreground: '#594605' });
    expect(resolveOsuModTheme('XX')).toBeNull();
    expect(resolveOsuModTheme('')).toBeNull();
  });
});
