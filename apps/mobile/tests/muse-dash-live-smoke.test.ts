import { describe, expect, it } from 'vitest';
import { MuseDashProvider } from '@/providers/muse-dash-provider';

const live = process.env.MUSE_DASH_LIVE_SMOKE === '1' ? describe : describe.skip;

live('Muse Dash public API live schema smoke', () => {
  it('validates search, player, albums, ce and diffdiff against the live contract', async () => {
    const provider = new MuseDashProvider();
    const players = await provider.searchPlayers('simooo');
    expect(players.length).toBeGreaterThan(0);
    const userId = players[0][1];
    const player = await provider.getPlayer(userId);
    expect(player.user.user_id).toBe(userId);
    expect(player.plays.length).toBeGreaterThan(0);
    const albums = await provider.getAlbums();
    expect(Object.keys(albums).length).toBeGreaterThan(0);
    const ce = await provider.getCe();
    expect(ce.c.ChineseS.length).toBeGreaterThan(0);
    const diffdiff = await provider.getDiffdiff();
    expect(diffdiff.length).toBeGreaterThan(0);
  }, 60_000);
});
