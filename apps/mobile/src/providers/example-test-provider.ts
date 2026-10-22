import { EXAMPLE_SONGS, type ExampleRecord } from '@/domain/example';
import { generatedSource } from './generated-source';

export function exampleTestPayload(displayName = '示例账号') {
  const records: ExampleRecord[] = EXAMPLE_SONGS.map(song => ({ song, score: 1000000, rating: 475 }));
  const bestSections = [
    { id: 'best30', title: 'Best 30', data: records.slice(0, 30) },
    { id: 'ranked10', title: 'Ranked 10', data: records.slice(30) },
  ];
  const rating = records.reduce((sum, record) => sum + record.rating, 0);
  return {
    kind: 'example' as const, displayName, records, bestSections,
    playerScore: { label: 'EXAMPLE RATING', value: rating, display: String(rating) },
    source: generatedSource(),
  };
}
