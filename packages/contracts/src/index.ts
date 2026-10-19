import { z } from 'zod';
export * from './inventory.js';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('awesomejm-api'),
  nodeVersion: z.string(),
  timestamp: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
