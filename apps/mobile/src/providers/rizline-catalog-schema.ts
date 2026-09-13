import { z } from 'zod';
import { RIZLINE_DIFFICULTIES, type RizlineCatalog } from '@/domain/rizline';

export const RizlineResourcePathSchema = z.string().min(1).refine(path => !path.startsWith('/')
  && !path.includes('\\') && !path.includes(':') && path.split('/').every(part => part !== '' && part !== '.' && part !== '..'));
const nullableCount = z.number().int().nonnegative().nullable();
const ChartSchema = z.object({
  id: z.string().min(1), songId: z.string().min(1), difficulty: z.enum(RIZLINE_DIFFICULTIES), level: z.string().min(1),
  constant: z.number().nonnegative().nullable(), designer: z.string().nullable(), hit: nullableCount,
  combo: nullableCount, maxScore: nullableCount, riztimeHit: nullableCount,
});
export const RizlineCatalogSchema: z.ZodType<RizlineCatalog> = z.object({
  schemaVersion: z.literal(1), resourceVersion: z.string().min(1), gameVersion: z.string().min(1),
  songs: z.array(z.object({
    id: z.string().min(1), title: z.string().min(1), artist: z.string().nullable(), illustrator: z.string().nullable(),
    packId: z.string().min(1), packName: z.string().min(1), bpm: z.string().nullable(), durationSeconds: z.number().positive().nullable(),
    updatedAt: z.iso.date().nullable(), coverPath: RizlineResourcePathSchema.nullable(), charts: z.array(ChartSchema).min(1),
    achievements: z.array(z.object({ id: z.string().min(1), title: z.string(), condition: z.string() })),
  })).min(1),
}).superRefine((catalog, context) => {
  const songs = new Set<string>(); const charts = new Set<string>();
  for (const song of catalog.songs) {
    const difficulties = new Set<string>();
    if (songs.has(song.id)) context.addIssue({ code: 'custom', message: 'Duplicate song ID' });
    songs.add(song.id);
    for (const chart of song.charts) {
      if (chart.songId !== song.id || charts.has(chart.id) || difficulties.has(chart.difficulty)) {
        context.addIssue({ code: 'custom', message: 'Invalid chart identity' });
      }
      charts.add(chart.id); difficulties.add(chart.difficulty);
      if (chart.hit != null && chart.riztimeHit != null && chart.riztimeHit > chart.hit) {
        context.addIssue({ code: 'custom', message: 'Invalid Riztime hit count' });
      }
      if (chart.riztimeHit != null && chart.maxScore !== 1_000_000 + 100 * chart.riztimeHit) {
        context.addIssue({ code: 'custom', message: 'Invalid maximum score' });
      }
      if (chart.difficulty === 'SP' && chart.constant !== null) {
        context.addIssue({ code: 'custom', message: 'SP has no rating constant' });
      }
    }
  }
});
const HashSchema = z.string().regex(/^[a-f\d]{64}$/i);
export const RizlineCurrentSchema = z.object({
  schemaVersion: z.literal(1), resourceVersion: z.string().min(1), manifestPath: RizlineResourcePathSchema, manifestSha256: HashSchema,
});
export const RizlineManifestSchema = z.object({
  schemaVersion: z.literal(1), resourceVersion: z.string().min(1), gameVersion: z.string().min(1), catalogPath: RizlineResourcePathSchema,
  files: z.array(z.object({ path: RizlineResourcePathSchema, size: z.number().int().nonnegative(), sha256: HashSchema })),
});
