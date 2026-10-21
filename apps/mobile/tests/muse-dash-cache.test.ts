import { afterEach, expect, it, vi } from 'vitest';
import { loadMuseDashPlayerFresh } from '@/services/muse-dash-cache';

afterEach(() => vi.unstubAllGlobals());

it('并发玩家读取共享请求，完成后的刷新取得新成绩', async () => {
  const pending = Promise.withResolvers<Response>();
  let score = 100;
  const fetcher = vi.fn().mockReturnValueOnce(pending.promise).mockImplementation(async () => Response.json({ rl: score, plays: [], user: { user_id: 'a', nickname: '公开玩家' } }));
  vi.stubGlobal('fetch', fetcher);
  const first = loadMuseDashPlayerFresh('a');
  const second = loadMuseDashPlayerFresh('a');
  pending.resolve(Response.json({ rl: score, plays: [], user: { user_id: 'a', nickname: '公开玩家' } }));
  const players = await Promise.all([first, second]);
  expect(players).toMatchObject([{ rl: 100, user: { user_id: 'a' } }, { rl: 100, user: { user_id: 'a' } }]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(String(fetcher.mock.calls[0]?.[0])).toBe('https://api.musedash.moe/player/a');
  score = 200;
  await expect(loadMuseDashPlayerFresh('a')).resolves.toMatchObject({ rl: 200 });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
