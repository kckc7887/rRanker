import { FIXTURE_CURRENT_VERSION } from '@/fixtures/sanitized';
import { useRecordsFilter } from '@/state/records-filter';

describe('useRecordsFilter store', () => {
  beforeEach(() => {
    useRecordsFilter.getState().reset();
  });

  it('starts with default filters', () => {
    const state = useRecordsFilter.getState();
    expect(state.difficulty).toBe('all');
    expect(state.version).toBe('all');
    expect(state.type).toBe('all');
    expect(state.constantMin).toBe('');
    expect(state.constantMax).toBe('');
    expect(state.sortBy).toBe('rating');
    expect(state.versionLocale).toBe('china');
  });

  it('updates difficulty via setDifficulty', () => {
    useRecordsFilter.getState().setDifficulty('master');
    expect(useRecordsFilter.getState().difficulty).toBe('master');
  });

  it('updates version via setVersion', () => {
    useRecordsFilter.getState().setVersion(FIXTURE_CURRENT_VERSION);
    expect(useRecordsFilter.getState().version).toBe(FIXTURE_CURRENT_VERSION);
  });

  it('updates type via setType', () => {
    useRecordsFilter.getState().setType('DX');
    expect(useRecordsFilter.getState().type).toBe('DX');
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
    useRecordsFilter.getState().setVersion(FIXTURE_CURRENT_VERSION);
    useRecordsFilter.getState().setType('DX');
    useRecordsFilter.getState().setConstantMin('12');
    useRecordsFilter.getState().setConstantMax('14');
    useRecordsFilter.getState().setSortBy('achievements');
    useRecordsFilter.getState().setVersionLocale('japan');
    useRecordsFilter.getState().reset();
    const state = useRecordsFilter.getState();
    expect(state.difficulty).toBe('all');
    expect(state.version).toBe('all');
    expect(state.type).toBe('all');
    expect(state.constantMin).toBe('');
    expect(state.constantMax).toBe('');
    expect(state.sortBy).toBe('rating');
    expect(state.versionLocale).toBe('china');
  });
});
