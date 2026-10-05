import {
  KALEIDX_GATES_BY_ID,
  KALEIDX_FINALES,
  resolveKaleidxSchedulePhase,
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
  it('round-trips gate and finale progress through the current preferences key', async () => {
    const key = 'rranker.toolbox.kaleidx-scope.v1';
    const values = new Map<string, string>([[key, JSON.stringify({ version: 1, byAccount: {
      a: { white: { completedSongIds: [], soloSongIds: ['11102'], multiSongIds: ['11234'], keyObtained: true, gateCleared: false } },
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

  it('rebuilds an old progress structure without changing other preferences', async () => {
    const key = 'rranker.toolbox.kaleidx-scope.v1';
    const values = new Map<string, string>([
      [key, JSON.stringify({ version: 1, byAccount: { a: { white: { soloSongIds: ['11102'], multiSongIds: [], keyObtained: true, gateCleared: false } } } })],
      ['other-preference', 'untouched'],
    ]);
    const preferences = new KaleidxScopePreferencesStore({
      getItem: async name => values.get(name) ?? null,
      setItem: async (name, value) => { values.set(name, value); },
      removeItem: async name => { values.delete(name); },
    });
    await expect(preferences.load()).resolves.toEqual({});
    expect(JSON.parse(values.get(key)!)).toEqual({ version: 1, byAccount: {} });
    expect(values.get('other-preference')).toBe('untouched');
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
