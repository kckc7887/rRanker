import { expect, it } from 'vitest';
import { exampleTestPayload } from '@/providers/example-test-provider';
import { presentExampleRecord } from '@/features/game-content/adapters/example';
import { decodeDetailTarget, detailTargetHref } from '@/domain/detail-target';
import { pickRandomItems } from '@/domain/random-charts';

it('generates 40 independent songs and consistent Best 30 and Ranked 10 totals', () => {
  const payload = exampleTestPayload();
  expect(payload.records).toHaveLength(40);
  expect(new Set(payload.records.map(record => record.song.id)).size).toBe(40);
  expect(payload.records[0].song.id).toBe('0001');
  expect(payload.records[39].song.id).toBe('0040');
  expect(payload.bestSections.map(section => [section.title, section.data.length, section.data.reduce((sum, record) => sum + record.rating, 0)]))
    .toEqual([['Best 30', 30, 14250], ['Ranked 10', 10, 4750]]);
  expect(payload.playerScore).toEqual({ label: 'EXAMPLE RATING', value: 19000, display: '19000' });
  for (const record of payload.records) {
    expect(record).toMatchObject({ score: 1000000, rating: 475, song: { title: 'EXAMPLE SONG', artist: '颍川ホコリ', genre: '流行', bpm: 120, version: 'EXAMPLE' } });
    const presentation = presentExampleRecord(record);
    expect(presentation.primaryMetric).toMatchObject({ label: 'Score', text: '1000000', effect: 'flowing-gradient' });
    expect(decodeDetailTarget(detailTargetHref(presentation.route).params)).toEqual({ ok: true, target: { game: 'example', songId: record.song.id, levelIndex: 0 } });
  }
});

it('draws one to four different example songs from the shared random picker', () => {
  const records = exampleTestPayload().records;
  for (const count of [1, 2, 3, 4] as const) {
    const picked = pickRandomItems(records, count, `example-${count}`);
    expect(picked).toHaveLength(count);
    expect(new Set(picked.map(record => record.song.id)).size).toBe(count);
    expect(picked.every(record => records.includes(record))).toBe(true);
  }
});
