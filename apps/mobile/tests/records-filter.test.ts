import { FIXTURE_CURRENT_VERSION } from '@/fixtures/sanitized';
import { useRecordsFilter } from '@/state/records-filter';

describe('useRecordsFilter store', () => {
  beforeEach(() => {
    useRecordsFilter.getState().reset();
  });

  it('starts with default filters', () => {
    const state = useRecordsFilter.getState();
    expect(state.keyword).toBe('');
    expect(state.collapsed).toBe(true);
    expect(state.difficulty).toBe('all');
    expect(state.version).toBe('all');
    expect(state.type).toBe('all');
    expect(state.constantMin).toBe('');
    expect(state.constantMax).toBe('');
    expect(state.achievementMin).toBe('');
    expect(state.achievementMax).toBe('');
    expect(state.soloAchievement).toBeNull();
    expect(state.multiAchievement).toBeNull();
    expect(state.sortBy).toBe('rating');
    expect(state.versionLocale).toBe('china');
  });

  it('updates difficulty via setDifficulty', () => {
    useRecordsFilter.getState().setDifficulty('master');
    expect(useRecordsFilter.getState().difficulty).toBe('master');
  });

  it('keeps the records keyword and collapsed state', () => {
    useRecordsFilter.getState().setKeyword('宴会场');
    useRecordsFilter.getState().setCollapsed(true);
    expect(useRecordsFilter.getState()).toMatchObject({ keyword: '宴会场', collapsed: true });
  });

  it('updates version via setVersion', () => {
    useRecordsFilter.getState().setVersion(FIXTURE_CURRENT_VERSION);
    expect(useRecordsFilter.getState().version).toBe(FIXTURE_CURRENT_VERSION);
  });

  it('updates type via setType', () => {
    useRecordsFilter.getState().setType('DX');
    expect(useRecordsFilter.getState().type).toBe('DX');
  });

  it('updates the achievement range via dedicated setters', () => {
    useRecordsFilter.getState().setAchievementMin('99.5');
    useRecordsFilter.getState().setAchievementMax('100.5');
    expect(useRecordsFilter.getState().achievementMin).toBe('99.5');
    expect(useRecordsFilter.getState().achievementMax).toBe('100.5');
  });

  it('updates solo and multi achievements independently', () => {
    useRecordsFilter.getState().setMultiAchievement('fs');
    expect(useRecordsFilter.getState().multiAchievement).toBe('fs');
    useRecordsFilter.getState().setSoloAchievement('app');
    expect(useRecordsFilter.getState().soloAchievement).toBe('app');
    expect(useRecordsFilter.getState().multiAchievement).toBe('fs');
  });

  it('updates the constant range via dedicated setters', () => {
    useRecordsFilter.getState().setConstantMin('12.6');
    useRecordsFilter.getState().setConstantMax('14.3');
    expect(useRecordsFilter.getState().constantMin).toBe('12.6');
    expect(useRecordsFilter.getState().constantMax).toBe('14.3');
  });

  it('updates sortBy via setSortBy', () => {
    useRecordsFilter.getState().setSortBy('achievements');
    expect(useRecordsFilter.getState().sortBy).toBe('achievements');
  });

  it('keeps the selected version-name locale in the store', () => {
    useRecordsFilter.getState().setVersionLocale('japan');
    expect(useRecordsFilter.getState().versionLocale).toBe('japan');
  });

  it('resets every filter back to defaults', () => {
    useRecordsFilter.getState().setDifficulty('master');
    useRecordsFilter.getState().setKeyword('旧条件');
    useRecordsFilter.getState().setCollapsed(true);
    useRecordsFilter.getState().setVersion(FIXTURE_CURRENT_VERSION);
    useRecordsFilter.getState().setType('DX');
    useRecordsFilter.getState().setConstantMin('12');
    useRecordsFilter.getState().setConstantMax('14');
    useRecordsFilter.getState().setAchievementMin('99');
    useRecordsFilter.getState().setAchievementMax('101');
    useRecordsFilter.getState().setSoloAchievement('ap');
    useRecordsFilter.getState().setMultiAchievement('fs');
    useRecordsFilter.getState().setSortBy('achievements');
    useRecordsFilter.getState().setVersionLocale('japan');
    useRecordsFilter.getState().reset();
    const state = useRecordsFilter.getState();
    expect(state.difficulty).toBe('all');
    expect(state.keyword).toBe('');
    expect(state.collapsed).toBe(true);
    expect(state.version).toBe('all');
    expect(state.type).toBe('all');
    expect(state.constantMin).toBe('');
    expect(state.constantMax).toBe('');
    expect(state.achievementMin).toBe('');
    expect(state.achievementMax).toBe('');
    expect(state.soloAchievement).toBeNull();
    expect(state.multiAchievement).toBeNull();
    expect(state.sortBy).toBe('rating');
    expect(state.versionLocale).toBe('china');
  });

  it('clears filters without collapsing or changing version locale', () => {
    useRecordsFilter.getState().setKeyword('宴会场');
    useRecordsFilter.getState().setDifficulty('master');
    useRecordsFilter.getState().setAchievementMin('99');
    useRecordsFilter.getState().setSoloAchievement('ap');
    useRecordsFilter.getState().setMultiAchievement('fs');
    useRecordsFilter.getState().setVersionLocale('japan');
    useRecordsFilter.getState().setCollapsed(false);
    useRecordsFilter.getState().clearFilters();
    expect(useRecordsFilter.getState()).toMatchObject({
      keyword: '', difficulty: 'all', version: 'all', type: 'all',
      constantMin: '', constantMax: '', achievementMin: '', achievementMax: '',
      soloAchievement: null, multiAchievement: null,
      versionLocale: 'japan', collapsed: false,
    });
  });
});
