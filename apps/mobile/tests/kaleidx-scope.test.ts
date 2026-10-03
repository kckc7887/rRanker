import {
  KALEIDX_GATES,
  KALEIDX_GATES_BY_ID,
  KALEIDX_STAGE_IDS,
  KALEIDX_STAGES,
  KALEIDX_FINALES,
  kaleidxStageChallenge,
  resolveKaleidxSchedulePhase,
  validateKaleidxScopeData,
} from '@/domain/kaleidx-scope';
import {
  parseKaleidxProgress,
  KaleidxScopePreferencesStore,
  type KaleidxProgressByAccount,
} from '@/features/toolbox/kaleidx-scope-preferences';
import { createKaleidxScopeProgressStore } from '@/state/kaleidx-scope-progress';

class MemoryPreferences {
  value: KaleidxProgressByAccount = {};
  failSave = false;

  async load(): Promise<KaleidxProgressByAccount> {
    return structuredClone(this.value);
  }

  async save(value: KaleidxProgressByAccount): Promise<void> {
    if (this.failSave) throw new Error('database unavailable');
    this.value = structuredClone(value);
  }
}

describe('KALEIDX◈SCOPE static data', () => {
  it('defines the complete CN progression and preserves the six keyed gates', () => {
    expect(KALEIDX_STAGES.map((stage) => stage.id)).toEqual(KALEIDX_STAGE_IDS);
    expect(KALEIDX_FINALES.map((stage) => stage.prerequisites)).toEqual([
      ['blue', 'white', 'purple', 'black', 'yellow', 'red'], ['prism'], ['error'], ['hope'],
    ]);
    expect(KALEIDX_STAGES.map((stage) => kaleidxStageChallenge(stage).kind)).toEqual([
      ...Array(7).fill('random-three'), 'error', 'fixed-three', 'final-single',
    ]);
    const [prism, error, hope, final] = KALEIDX_FINALES.map((stage) => stage.challenge);
    expect(prism).toMatchObject({ kind: 'random-three', track3: { id: '11818', chartType: 'DX' } });
    if (prism.kind !== 'random-three' || error.kind !== 'error') throw new Error('Unexpected challenge');
    expect(prism.track1.map((song) => song.id)).toEqual(['11310', '11309', '11395', '11393', '11392', '11534', '11535', '11536', '11815', '11816']);
    expect(prism.track2.map((song) => song.id)).toEqual(['11311', '11394', '11537', '11817']);
    expect(error.track1.map((song) => song.id)).toEqual(['11739', '11744', '11752', '11808', '11813', '11817']);
    expect(error.track2.map((song) => song.id)).toEqual(['11740', '11745', '11749', '11753', '11809', '11814', '11818']);
    expect(error).not.toHaveProperty('track3');
    expect(hope).toMatchObject({ kind: 'fixed-three', tracks: [
      { id: '1736', chartType: 'SD' }, { id: '10835', chartType: 'DX' }, { id: '1819', chartType: 'SD' },
    ] });
    expect(final).toMatchObject({ kind: 'final-single', song: { id: '11820', chartType: 'DX' }, endingSong: { id: '11821', chartType: 'DX' } });
    expect(validateKaleidxScopeData()).toEqual([]);
  });

  it('keeps estimated CN dates out of current conditions and leaves unverified DX LIFE unknown', () => {
    const schedule = KALEIDX_FINALES.find((stage) => stage.id === 'final')!.gateSchedule!;
    expect(schedule.evidence).toMatchObject({ status: 'estimated', source: { checkedAt: '2026-10-03' } });
    expect(schedule.phases.map((phase) => [phase.startsAt.slice(5, 10), phase.difficulty, phase.life, phase.dxLife])).toEqual([
      ['10-01', 'Re:MASTER', 1, null], ['10-03', 'Re:MASTER', 5, null],
      ['10-05', 'Re:MASTER', 10, null], ['10-06', 'Re:MASTER', 30, null],
      ['10-07', 'MASTER', 30, null], ['10-11', 'MASTER', 50, null],
      ['10-13', 'MASTER', 100, null], ['10-15', 'EXPERT', 100, 999], ['10-22', 'BASIC', 999, null],
    ]);
    for (const phase of schedule.phases) {
      for (const offset of [-1, 0, 1]) {
        expect(resolveKaleidxSchedulePhase(schedule, new Date(Date.parse(phase.startsAt) + offset))).toBeNull();
      }
    }
    const red = KALEIDX_GATES_BY_ID.red.gateSchedule;
    expect(resolveKaleidxSchedulePhase(red, new Date('2026-08-18T03:59:59.999+08:00'))?.life).toBe(50);
    expect(resolveKaleidxSchedulePhase(red, new Date('2026-08-18T04:00:00+08:00'))?.difficulty).toBe('EXPERT');
  });

  it('rejects duplicate pools, invalid prerequisite order and malformed LIFE data', () => {
    const prism = KALEIDX_FINALES[0];
    const challenge = prism.challenge;
    if (challenge.kind !== 'random-three') throw new Error('Unexpected challenge');
    expect(validateKaleidxScopeData([...KALEIDX_GATES, {
      ...prism, prerequisites: ['final'],
      challenge: { ...challenge, track1: [challenge.track1[0], challenge.track1[0]] },
      gateSchedule: { ...prism.gateSchedule!, phases: [{ startsAt: 'invalid', endsAt: null, life: 0, dxLife: -1, difficulty: 'Re:MASTER' }] },
    }])).toEqual(expect.arrayContaining([
      'prism 前置阶段无效：final', 'prism TRACK 1歌曲重复：11310', 'prism 棱镜塔第 1 阶段日期无效',
      'prism 棱镜塔 LIFE 无效', 'prism 棱镜塔 DX LIFE 无效',
    ]));
  });

  it('defines the six CN gates in release order with validated pools and schedules', () => {
    expect(KALEIDX_GATES.map((gate) => gate.id)).toEqual(['blue', 'white', 'purple', 'black', 'yellow', 'red']);
    expect(KALEIDX_GATES.map((gate) => gate.keySongs.length)).toEqual([29, 6, 28, 11, 12, 10]);
    expect(KALEIDX_GATES.map((gate) => gate.area)).toEqual([
      '青春区域', '天界区域 8', 'BLACK ROSE 区域 10', '大都会区域 9', '七彩区域', '龙之区域 4',
    ]);
    expect(KALEIDX_GATES.every((gate) => !/[（）]|\bkm\b/i.test(gate.area))).toBe(true);
    expect(KALEIDX_GATES.map((gate) => gate.track3.title)).toEqual([
      '果ての空、僕らが見た光。',
      '氷滅の135小節',
      '有明/Ariake',
      '宙天',
      'Åntinomiε',
      'FLΛME/FRΦST',
    ]);
    expect(KALEIDX_GATES_BY_ID.black).toMatchObject({
      color: '#475569',
      onColor: '#FFFFFF',
      darkColor: '#CBD5E1',
      darkOnColor: '#182130',
    });
    expect(validateKaleidxScopeData()).toEqual([]);
  });

  it('resolves the red gate and perfect-challenge phases at key dates', () => {
    const red = KALEIDX_GATES_BY_ID.red;
    expect(resolveKaleidxSchedulePhase(red.gateSchedule, new Date('2026-08-10T12:00:00+08:00')))
      .toMatchObject({ difficulty: 'MASTER', life: 10 });
    expect(resolveKaleidxSchedulePhase(red.perfectSchedule!, new Date('2026-08-10T12:00:00+08:00')))
      .toMatchObject({ difficulty: 'EXPERT', life: 50 });
    expect(resolveKaleidxSchedulePhase(red.gateSchedule, new Date('2026-08-25T12:00:00+08:00')))
      .toMatchObject({ difficulty: 'BASIC', life: 999 });
  });
});

describe('KALEIDX◈SCOPE progress parsing and state', () => {
  it('round-trips old and finale progress through the same v1 preferences key', async () => {
    const key = 'rranker.toolbox.kaleidx-scope.v1';
    const values = new Map<string, string>([[key, JSON.stringify({ version: 1, byAccount: {
      a: { white: { soloSongIds: ['11102'], multiSongIds: ['11234'], keyObtained: true, gateCleared: false } },
    } })]]);
    const preferences = new KaleidxScopePreferencesStore({
      getItem: async (name) => values.get(name) ?? null,
      setItem: async (name, value) => { values.set(name, value); },
      removeItem: async (name) => { values.delete(name); },
    });
    const store = createKaleidxScopeProgressStore(preferences);
    await store.getState().hydrate();
    expect(store.getState().byAccount.a?.final).toBeUndefined();
    await Promise.all([
      store.getState().setGateCleared('a', 'final', true),
      store.getState().setGateCleared('a', 'prism', true),
      store.getState().setGateCleared('b', 'error', true),
    ]);
    await store.getState().setGateCleared('a', 'prism', false);
    const restored = createKaleidxScopeProgressStore(preferences);
    await restored.getState().hydrate();
    expect(restored.getState().byAccount.a?.white).toMatchObject({ soloSongIds: ['11102'], multiSongIds: ['11234'], keyObtained: true });
    expect(restored.getState().byAccount.a?.final).toMatchObject({ gateCleared: true, keyObtained: false });
    expect(restored.getState().byAccount.a?.prism?.gateCleared).toBe(false);
    expect(restored.getState().byAccount.a?.hope).toBeUndefined();
    expect(restored.getState().byAccount.b?.error?.gateCleared).toBe(true);
    expect(restored.getState().byAccount.b?.final).toBeUndefined();
    expect([...values.keys()]).toEqual([key]);
    expect(JSON.parse(values.get(key)!).version).toBe(1);
  });

  it('discards fictitious finale keys and song plans and rolls back failed completion writes', async () => {
    expect(parseKaleidxProgress({ version: 1, byAccount: { a: { final: {
      gateCleared: true, keyObtained: true, completedSongIds: ['11820'], soloSongIds: ['11820'],
    } } } }).a?.final).toEqual({ gateCleared: true, keyObtained: false, completedSongIds: [], soloSongIds: [], multiSongIds: [] });
    const preferences = new MemoryPreferences();
    const store = createKaleidxScopeProgressStore(preferences);
    await store.getState().setGateCleared('a', 'hope', true);
    preferences.failSave = true;
    await expect(store.getState().setGateCleared('a', 'final', true)).rejects.toThrow();
    expect(store.getState().byAccount.a?.final).toBeUndefined();
    expect(store.getState().byAccount.a?.hope?.gateCleared).toBe(true);
    preferences.failSave = false;
    await store.getState().setGateCleared('a', 'final', true);
    expect(store.getState().byAccount.a?.final).toMatchObject({ gateCleared: true, keyObtained: false });
  });

  it('filters unknown gates and songs, truncates run plans, and keeps cleared gates keyed', () => {
    const parsed = parseKaleidxProgress({
      version: 1,
      byAccount: {
        'maimai:local:a': {
          white: {
            soloSongIds: ['11102', '11234', '11300', '11529', 'missing'],
            multiSongIds: ['11102', '11234', '11300', '11529', '11542'],
            completedSongIds: ['11102'],
            keyObtained: false,
            gateCleared: true,
          },
          yellow: { completedSongIds: ['11003', '11095'], keyObtained: false, gateCleared: false },
          unknown: { completedSongIds: ['x'] },
        },
      },
    });
    expect(parsed['maimai:local:a']?.white).toMatchObject({
      soloSongIds: ['11102', '11234', '11300'],
      multiSongIds: ['11102', '11234', '11300', '11529'],
      completedSongIds: [],
      keyObtained: true,
      gateCleared: true,
    });
    expect(parsed['maimai:local:a']?.yellow?.completedSongIds).toEqual(['11003']);
    expect(parsed['maimai:local:a']).not.toHaveProperty('unknown');
  });

  it('isolates accounts and keeps solo and multiplayer plans separate', async () => {
    const preferences = new MemoryPreferences();
    const store = createKaleidxScopeProgressStore(preferences);
    await store.getState().toggleSong('maimai:local:a', 'white', '11102', 'solo');
    await store.getState().toggleSong('maimai:local:a', 'white', '11234', 'multi');
    await store.getState().toggleSong('maimai:local:b', 'white', '11300', 'solo');
    expect(store.getState().byAccount['maimai:local:a']?.white).toMatchObject({
      soloSongIds: ['11102'],
      multiSongIds: ['11234'],
    });
    expect(store.getState().byAccount['maimai:local:b']?.white?.soloSongIds).toEqual(['11300']);
  });

  it('enforces run size, replaces yellow random hits, and clears a run', async () => {
    const store = createKaleidxScopeProgressStore(new MemoryPreferences());
    for (const id of ['11102', '11234', '11300']) await store.getState().toggleSong('a', 'white', id, 'solo');
    await expect(store.getState().toggleSong('a', 'white', '11529', 'solo')).rejects.toThrow('本局最多选择 3 首');
    await store.getState().toggleSong('a', 'yellow', '11003');
    await store.getState().toggleSong('a', 'yellow', '11095');
    expect(store.getState().byAccount.a?.yellow?.completedSongIds).toEqual(['11095']);
    await store.getState().clearRun('a', 'white', 'solo');
    expect(store.getState().byAccount.a?.white?.soloSongIds).toEqual([]);
  });

  it('marks a cleared gate as keyed and rolls back persistence failures', async () => {
    const preferences = new MemoryPreferences();
    const store = createKaleidxScopeProgressStore(preferences);
    await store.getState().setGateCleared('a', 'red', true);
    expect(store.getState().byAccount.a?.red).toMatchObject({ gateCleared: true, keyObtained: true });
    await store.getState().setGateCleared('a', 'red', false);
    expect(store.getState().byAccount.a?.red).toMatchObject({ gateCleared: false, keyObtained: true });

    preferences.failSave = true;
    await expect(store.getState().setKeyObtained('a', 'blue', true)).rejects.toThrow('database unavailable');
    expect(store.getState().byAccount.a?.blue).toBeUndefined();
  });
});
