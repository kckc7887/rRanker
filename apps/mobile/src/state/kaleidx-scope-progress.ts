import { create } from 'zustand';
import { KALEIDX_GATES_BY_ID, type KaleidxGateId } from '@/domain/kaleidx-scope';
import {
  emptyKaleidxGateProgress,
  kaleidxScopePreferencesStore,
  type KaleidxAccountProgress,
  type KaleidxGateProgress,
  type KaleidxProgressByAccount,
  type KaleidxRunMode,
} from '@/features/toolbox/kaleidx-scope-preferences';

type KaleidxScopeProgressState = {
  hydrated: boolean;
  byAccount: KaleidxProgressByAccount;
  hydrate: () => Promise<void>;
  toggleSong: (accountId: string, gateId: KaleidxGateId, songId: string, runMode?: KaleidxRunMode) => Promise<void>;
  clearRun: (accountId: string, gateId: KaleidxGateId, runMode: KaleidxRunMode) => Promise<void>;
  setKeyObtained: (accountId: string, gateId: KaleidxGateId, value: boolean) => Promise<void>;
  setGateCleared: (accountId: string, gateId: KaleidxGateId, value: boolean) => Promise<void>;
};

type PreferencesAccess = Pick<typeof kaleidxScopePreferencesStore, 'load' | 'save'>;

function progressFor(account: KaleidxAccountProgress | undefined, gateId: KaleidxGateId): KaleidxGateProgress {
  return account?.[gateId] ?? emptyKaleidxGateProgress();
}

function nextSongIds(current: readonly string[], songId: string, limit?: number): string[] {
  if (current.includes(songId)) return current.filter((id) => id !== songId);
  if (limit !== undefined && current.length >= limit) {
    throw new Error(`本局最多选择 ${limit} 首不重复曲目`);
  }
  return [...current, songId];
}

export function createKaleidxScopeProgressStore(preferences: PreferencesAccess = kaleidxScopePreferencesStore) {
  let hydrationPromise: Promise<void> | null = null;
  let mutationQueue: Promise<void> = Promise.resolve();
  return create<KaleidxScopeProgressState>((set, get) => {
    const mutate = (
      update: (current: KaleidxProgressByAccount) => KaleidxProgressByAccount,
    ): Promise<void> => {
      const operation = mutationQueue.then(async () => {
        await get().hydrate();
        const previous = get().byAccount;
        const next = update(previous);
        set({ byAccount: next });
        try {
          await preferences.save(next);
        } catch (error) {
          set({ byAccount: previous });
          throw error;
        }
      });
      mutationQueue = operation.catch(() => undefined);
      return operation;
    };

    const updateGate = (
      accountId: string,
      gateId: KaleidxGateId,
      transform: (current: KaleidxGateProgress) => KaleidxGateProgress,
    ) => mutate((current) => {
      const account = current[accountId] ?? {};
      return {
        ...current,
        [accountId]: {
          ...account,
          [gateId]: transform(progressFor(account, gateId)),
        },
      };
    });

    return {
      hydrated: false,
      byAccount: {},
      hydrate: async () => {
        if (get().hydrated) return;
        hydrationPromise ??= preferences.load().then((byAccount) => {
          set({ hydrated: true, byAccount });
        }).finally(() => {
          hydrationPromise = null;
        });
        await hydrationPromise;
      },
      toggleSong: (accountId, gateId, songId, runMode) => updateGate(accountId, gateId, (current) => {
        const gate = KALEIDX_GATES_BY_ID[gateId];
        if (!gate.keySongs.some((song) => song.id === songId)) return current;
        if (gate.trackerKind === 'run') {
          if (!runMode) return current;
          const key = runMode === 'solo' ? 'soloSongIds' : 'multiSongIds';
          return { ...current, [key]: nextSongIds(current[key], songId, runMode === 'solo' ? 3 : 4) };
        }
        if (gate.trackerKind === 'random-one') {
          return {
            ...current,
            completedSongIds: current.completedSongIds.includes(songId) ? [] : [songId],
          };
        }
        return {
          ...current,
          completedSongIds: nextSongIds(current.completedSongIds, songId),
        };
      }),
      clearRun: (accountId, gateId, runMode) => updateGate(accountId, gateId, (current) => ({
        ...current,
        [runMode === 'solo' ? 'soloSongIds' : 'multiSongIds']: [],
      })),
      setKeyObtained: (accountId, gateId, value) => updateGate(accountId, gateId, (current) => ({
        ...current,
        keyObtained: value || current.gateCleared,
      })),
      setGateCleared: (accountId, gateId, value) => updateGate(accountId, gateId, (current) => ({
        ...current,
        gateCleared: value,
        keyObtained: value ? true : current.keyObtained,
      })),
    };
  });
}

export const useKaleidxScopeProgress = createKaleidxScopeProgressStore();

export function selectKaleidxGateProgress(
  state: Pick<KaleidxScopeProgressState, 'byAccount'>,
  accountId: string,
  gateId: KaleidxGateId,
): KaleidxGateProgress {
  return progressFor(state.byAccount[accountId], gateId);
}
