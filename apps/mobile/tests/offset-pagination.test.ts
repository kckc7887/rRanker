import { describe, expect, it, vi } from 'vitest';
import { loadOffsetPagesBounded, offsetPageStarts } from '@/services/offset-pagination';

describe('bounded offset pagination', () => {
  it('builds stable page offsets', () => {
    expect(offsetPageStarts(0, 30)).toEqual([]);
    expect(offsetPageStarts(61, 30)).toEqual([0, 30, 60]);
  });

  it('never exceeds the requested concurrency and reports failed offsets', async () => {
    let active = 0;
    let maximum = 0;
    const seen: number[] = [];
    const loadPage = vi.fn(async (offset: number) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 4));
      active -= 1;
      if (offset === 60) throw new Error('failed page');
      return { offset };
    });
    const failures = await loadOffsetPagesBounded({
      offsets: [0, 30, 60, 90, 120],
      concurrency: 3,
      loadPage,
      onPage: (page) => seen.push(page.offset),
    });
    expect(maximum).toBe(3);
    expect(seen.sort((left, right) => left - right)).toEqual([0, 30, 90, 120]);
    expect(failures.map((failure) => failure.offset)).toEqual([60]);
  });

  it('stops publishing results after cancellation', async () => {
    const controller = new AbortController();
    const onPage = vi.fn();
    await loadOffsetPagesBounded({
      offsets: [0, 30, 60],
      concurrency: 1,
      signal: controller.signal,
      loadPage: async (offset) => {
        controller.abort();
        return offset;
      },
      onPage,
    });
    expect(onPage).not.toHaveBeenCalled();
  });
});
