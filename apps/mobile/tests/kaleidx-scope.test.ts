import {
  KALEIDX_GATES,
  KALEIDX_GATES_BY_ID,
  resolveKaleidxSchedulePhase,
  validateKaleidxScopeData,
} from '@/domain/kaleidx-scope';
import {
  parseKaleidxProgress,
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
  it('defines the six CN gates in release order with validated pools and schedules', () => {
    expect(KALEIDX_GATES.map((gate) => gate.id)).toEqual(['blue', 'white', 'purple', 'black', 'yellow', 'red']);
    expect(KALEIDX_GATES.map((gate) => gate.keySongs.length)).toEqual([29, 6, 28, 11, 12, 10]);
    expect(KALEIDX_GATES.map((gate) => gate.track3.title)).toEqual([
      '果ての空、僕らが見た光。',
      '氷滅の135小節',
      '有明/Ariake',
      '宙天',
      'Åntinomiε',
      'FLΛME/FRΦST',
    ]);
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
