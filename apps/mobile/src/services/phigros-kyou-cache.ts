import type { PhigrosKyouAliasesSnapshot } from '@/domain/phigros-kyou';
import { PhigrosKyouProvider } from '@/providers/phigros-kyou-provider';
import { captureResourceWrites, createInflightGuard, resourceWriteGeneration } from '@/services/snapshot-cache-utils';

export const PHIGROS_KYOU_STALE_TIME_MS = 60 * 60 * 1000;

const provider = new PhigrosKyouProvider();
const inflight = createInflightGuard<string>();
let generation = 0;
let aliases: { value: PhigrosKyouAliasesSnapshot; loadedAt: number; generation: string } | undefined;

export async function loadPhigrosKyouAliases(signal?: AbortSignal): Promise<PhigrosKyouAliasesSnapshot> {
  if (signal?.aborted) throw signal.reason;
  const requestGeneration = `${generation}:${resourceWriteGeneration('phigros')}`;
  if (aliases?.generation === requestGeneration && Date.now() - aliases.loadedAt < PHIGROS_KYOU_STALE_TIME_MS) {
    return aliases.value;
  }
  const assertRequestCurrent = captureResourceWrites('phigros');
  return inflight.share(requestGeneration, async (sharedSignal) => {
    assertRequestCurrent();
    const loadedAt = Date.now();
    const value = await provider.getAliases(sharedSignal);
    if (sharedSignal.aborted) throw sharedSignal.reason;
    assertRequestCurrent();
    aliases = { value, loadedAt, generation: requestGeneration };
    return value;
  }, signal);
}

export function resetPhigrosKyouAliasesCache(): void {
  generation += 1;
  aliases = undefined;
  inflight.clear();
}
