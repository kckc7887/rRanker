import { z } from 'zod';

export const DataSourceSchema = z.object({
  kind: z.string().min(1), label: z.string(), updatedAt: z.string(), isStale: z.boolean(),
}).passthrough();
