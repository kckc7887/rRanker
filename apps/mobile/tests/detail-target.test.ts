import { describe, expect, it } from 'vitest';
import { detailHref, getGameAdapter, type DetailParams } from '@rranker/sdk';

const cases: [string, DetailParams][] = [
  ['maimai', { songId: '152', chartType: 'DX', levelIndex: '4' }],
  ['example', { songId: '0001', levelIndex: '0' }],
  ['phigros', { songId: 'Song.A', levelIndex: '3' }],
  ['chunithm', { songId: '3', levelIndex: '3' }],
  ['majdata-net', { songId: 'uuid-1', levelIndex: '5' }],
  ['rizline', { songId: 'song.a', levelIndex: '2' }],
  ['musedash', { songId: '0-47', levelIndex: '3' }],
  ['phira', { songId: '19365' }], ['adofai', { songId: '11372' }],
  ['osu-standard', { songId: '3720', beatmapId: '22423', scoreId: '999' }],
  ['osu-mania', { songId: '3720', beatmapId: '22423' }],
];

describe('adapter detail targets', () => {
  it.each(cases)('%s preserves its own identifiers through generic navigation', (gameId, params) => {
    const href = detailHref({ gameId, params });
    const { gameId: routedGame, ...routedParams } = href.params;
    expect(getGameAdapter(routedGame)?.parseDetailParams(routedGame, routedParams)).toEqual(params);
    expect(href.pathname).toBe('/detail');
  });

  it.each([
    ['osu-standard', { songId: '3720', beatmapId: '1', levelIndex: '2' }],
    ['phigros', { songId: 'Song.A', beatmapId: '22423' }],
    ['phigros', { songId: 'Song.A', chartType: 'DX' }],
    ['maimai', { songId: '1', chartType: 'XX' }],
    ['rizline', { songId: 'song.a', scoreId: '9' }],
    ['phira', { songId: '1', levelIndex: '0' }],
  ] as [string, DetailParams][])('rejects parameters owned by a different target for %s', (gameId, params) => {
    expect(getGameAdapter(gameId)?.parseDetailParams(gameId, params)).toBeNull();
  });

  it('rejects missing identifiers and invalid indices without catalog data', () => {
    const adapter = getGameAdapter('phigros')!;
    for (const params of [{}, { songId: ' ' }, ...['abc', '-1', '1.5', '9007199254740992'].map(levelIndex => ({ songId: 'Song.A', levelIndex }))]) {
      expect(adapter.parseDetailParams('phigros', params)).toBeNull();
    }
    expect(adapter.parseLibraryTarget({ kind: 'chart', gameId: 'phigros', id: 'wrong', target: { songId: 'Song.A', levelIndex: '2' } })).toBeNull();
    expect(adapter.parseLibraryTarget({ kind: 'song', gameId: 'phigros', id: 'Song.A', target: {} })).toBeNull();
  });
});
