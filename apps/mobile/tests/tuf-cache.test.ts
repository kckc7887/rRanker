import { afterEach, expect, it, vi } from 'vitest';
import { loadTufPlayerFresh } from '@/services/tuf-cache';

afterEach(() => vi.unstubAllGlobals());

it('并发玩家读取共享请求，完成后的刷新取得新成绩', async () => {
  const pending = Promise.withResolvers<Response>();
  let score = 100;
  const fetcher = vi.fn().mockReturnValueOnce(pending.promise).mockImplementation(async () => Response.json({ id: 25, name: '公开玩家', rankedScore: score }));
  vi.stubGlobal('fetch', fetcher);
  const first = loadTufPlayerFresh(25);
  const second = loadTufPlayerFresh(25);
  pending.resolve(Response.json({ id: 25, name: '公开玩家', rankedScore: score }));
  const players = await Promise.all([first, second]);
  expect(players).toEqual([expect.objectContaining({ id: 25, rankedScore: 100 }), expect.objectContaining({ id: 25, rankedScore: 100 })]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(String(fetcher.mock.calls[0]?.[0])).toBe('https://api.tuforums.com/v3/players/25/profile');
  score = 200;
  await expect(loadTufPlayerFresh(25)).resolves.toMatchObject({ rankedScore: 200 });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
