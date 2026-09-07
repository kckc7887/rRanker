import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GAME_OPTIONS, findGame, findProvider } from '@/domain/game-bind-options';

describe('bundled game and provider icons', () => {
  it('maps every registered game to its local icon', () => {
    expect(Object.fromEntries(GAME_OPTIONS.map(game => [game.id, game.icon]))).toEqual({
      maimai: '/assets/images/maimai-dx.webp',
      chunithm: '/assets/images/chunithm.webp',
      adofai: '/assets/images/adofai.webp',
      musedash: '/assets/images/musedash.webp',
      phira: '/assets/images/phira.webp',
      phigros: '/assets/images/phigros.webp',
      'osu-standard': '/assets/images/osu-standard.webp',
      'osu-mania': '/assets/images/osu-mania.webp',
      'osu-catch': '/assets/images/osu-catch.webp',
      'osu-taiko': '/assets/images/osu-taiko.webp',
      'majdata-net': '/assets/images/majdata.png',
    });
  });

  it('maps every provider to its local brand or shared example icon', () => {
    expect(Object.fromEntries(GAME_OPTIONS.flatMap(game =>
      game.providers.map(provider => [provider.id, provider.icon]),
    ))).toEqual({
      'diving-fish': '/assets/images/diving-fish.webp',
      lxns: '/assets/images/lxns.webp',
      local: '/assets/images/maimai-dx.webp',
      'maimai-test': '/assets/images/example-account.webp',
      'chunithm-test': '/assets/images/example-account.webp',
      tuf: '/assets/images/tuf.webp',
      'musedash-moe': '/assets/images/musedash.webp',
      'musedash-test': '/assets/images/example-account.webp',
      'phira-community': '/assets/images/phira.webp',
      'phi-taptap': '/assets/images/taptap.webp',
      'phigros-test': '/assets/images/example-account.webp',
      osu: '/assets/images/osu.png',
      'majdata-net': '/assets/images/majdata.png',
    });
  });

  it('reuses identical brands and examples while keeping the osu family and modes distinct', () => {
    const exampleIcon = findProvider('maimai-test')!.icon;
    expect(findProvider('chunithm-test')!.icon).toBe(exampleIcon);
    expect(findProvider('phigros-test')!.icon).toBe(exampleIcon);
    expect(findProvider('musedash-test')!.icon).toBe(exampleIcon);
    expect(findGame('chunithm')!.providers.find(provider => provider.id === 'lxns')!.icon)
      .toBe(findProvider('lxns')!.icon);
    expect(findProvider('local')!.icon).toBe(findGame('maimai')!.icon);
    expect(findProvider('musedash-moe')!.icon).toBe(findGame('musedash')!.icon);
    expect(findProvider('phira-community')!.icon).toBe(findGame('phira')!.icon);
    expect(findProvider('majdata-net')!.icon).toBe(findGame('majdata-net')!.icon);
    expect(findProvider('tuf')!.icon).not.toBe(findGame('adofai')!.icon);

    const familyIcon = findGame('osu-standard')!.familyIcon;
    expect(familyIcon).toBe(findProvider('osu')!.icon);
    const modeIcons = GAME_OPTIONS.filter(game => game.familyId === 'osu').map(game => game.icon);
    expect(modeIcons).toHaveLength(4);
    expect(new Set([familyIcon, ...modeIcons]).size).toBe(5);
  });

  it('ships all game, provider and family sources as 17 nonempty local assets', () => {
    const icons = new Set(GAME_OPTIONS.flatMap(game => [
      game.icon,
      ...(game.familyIcon ? [game.familyIcon] : []),
      ...game.providers.map(provider => provider.icon),
    ]));
    expect(icons.size).toBe(17);
    for (const icon of icons) {
      expect(icon).toEqual(expect.stringMatching(/^\/assets\/images\/[^/]+\.(?:png|webp)$/u));
      const file = statSync(resolve(process.cwd(), String(icon).slice(1)));
      expect(file.isFile()).toBe(true);
      expect(file.size).toBeGreaterThan(0);
    }
  });
});
