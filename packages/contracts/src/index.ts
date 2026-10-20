import { z } from 'zod';
export * from './inventory.js';
export * from './rates.js';
export * from './customers.js';
export * from './sales.js';
export * from './orders.js';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('awesomejm-api'),
  nodeVersion: z.string(),
  timestamp: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
