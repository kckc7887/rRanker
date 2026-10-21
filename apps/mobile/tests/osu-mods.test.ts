import {
  osuModDescription,
  osuModIconFileName,
  osuUserPlayableMods,
  resolveOsuModTheme,
} from '@/domain/osu-mods';

describe('osu! 模组元数据映射', () => {
  it('按玩法筛选可选模组，排除系统计分标记', () => {
    expect(osuUserPlayableMods('osu-mania').some(item => item.acronym === '4K')).toBe(true);
    expect(osuUserPlayableMods('osu-standard').some(item => item.acronym === '4K')).toBe(false);
    expect(osuUserPlayableMods('osu-standard').some(item => item.acronym === 'SV2')).toBe(false);
    expect(osuModDescription('HD', 'osu-standard')).toContain('缩圈');
  });

  it('图标文件名 = acronym 小写 + .svg（含 SV2 与 mania 键数系列）', () => {
    expect(osuModIconFileName('DT')).toBe('dt.svg');
    expect(osuModIconFileName('HD')).toBe('hd.svg');
    expect(osuModIconFileName('SV2')).toBe('sv2.svg');
    expect(osuModIconFileName('10K')).toBe('10k.svg');
  });

  it('resolveOsuModTheme：已知模组返回类型色，未知 acronym 返回 null', () => {
    expect(resolveOsuModTheme('HD')).toEqual({ background: '#FF6666', foreground: '#591E1E' });
    expect(resolveOsuModTheme('EZ')).toEqual({ background: '#B3FF66', foreground: '#3C591E' });
    expect(resolveOsuModTheme('RX')).toEqual({ background: '#66CCFF', foreground: '#1E4659' });
    expect(resolveOsuModTheme('CL')).toEqual({ background: '#8C66FF', foreground: '#2D1E59' });
    expect(resolveOsuModTheme('TD')).toEqual({ background: '#FFCC22', foreground: '#594605' });
    expect(resolveOsuModTheme('XX')).toBeNull();
    expect(resolveOsuModTheme('')).toBeNull();
  });

  it('仅为存在固定玩法影响的模组提供当前模式倍率', () => {
    const standard = osuUserPlayableMods('osu-standard');
    const taiko = osuUserPlayableMods('osu-taiko');
    expect(standard.find((item) => item.acronym === 'EZ')?.gameplayMultipliersByGameId?.['osu-standard'])
      .toContainEqual({ label: '圆圈大小', value: '0.50×' });
    expect(taiko.find((item) => item.acronym === 'HR')?.gameplayMultipliersByGameId?.['osu-taiko'])
      .toContainEqual({ label: '滚动速度', value: '1.87×' });
    expect(standard.find((item) => item.acronym === 'DT')?.gameplayMultipliersByGameId?.['osu-standard'])
      .toEqual([{ label: '默认速度', value: '1.50×' }]);
    expect(standard.find((item) => item.acronym === 'HD')?.gameplayMultipliersByGameId).toBeUndefined();
  });
});
