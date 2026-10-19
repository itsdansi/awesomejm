import { z } from 'zod';
import { metalSchema } from './inventory.js';

export function nepalToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kathmandu',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) =>
    parts.find((part) => part.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

const rateDateSchema = z.iso
  .date()
  .refine(
    (value) => value >= '2000-01-01' && value <= '2099-12-31',
    'Choose a date between 2000 and 2099.',
  );
const finenessSchema = z
  .string()
  .regex(
    /^(?:[1-9]\d{0,2}|1000)(?:\.\d{1,3})?$/,
    'Enter purity in parts per thousand, up to 3 decimal places.',
  )
  .refine((value) => Number(value) <= 1000, 'Purity cannot exceed 1000.');
const moneySchema = z
  .string()
  .regex(
    /^(0|[1-9]\d{0,8})(\.\d{1,2})?$/,
    'Enter NPR with up to 2 decimal places.',
  )
  .refine((value) => Number(value) > 0, 'Rate must be greater than zero.');

export const publishRateSchema = z
  .object({
    rateDate: rateDateSchema.refine(
      (value) => value <= nepalToday(),
      'Future rates cannot be published.',
    ),
    metal: metalSchema,
    fineness: finenessSchema,
    buyRatePerTola: moneySchema,
    sellRatePerTola: moneySchema,
    source: z
      .string()
      .trim()
      .min(1, 'Enter a source or describe how this rate was set.')
      .max(160),
    reason: z.string().trim().max(500).default(''),
    expectedRevision: z.number().int().min(0).max(2147483646),
  })
  .strict()
  .refine((value) => value.expectedRevision === 0 || value.reason.length >= 5, {
    path: ['reason'],
    message: 'Explain the revision in at least 5 characters.',
  });
export type PublishRate = z.infer<typeof publishRateSchema>;

export const rateQuerySchema = z.object({
  date: rateDateSchema.default(() => nepalToday()),
  metal: metalSchema.optional(),
});
export type RateQuery = z.infer<typeof rateQuerySchema>;
export const rateHistoryQuerySchema = z
  .object({
    from: rateDateSchema.optional(),
    to: rateDateSchema.optional(),
    metal: metalSchema.optional(),
    fineness: finenessSchema.optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    path: ['to'],
    message: 'End date must be on or after start date.',
  });
export type RateHistoryQuery = z.infer<typeof rateHistoryQuerySchema>;
export const metalRateSchema = z.object({
  id: z.uuid(),
  rateDate: z.iso.date(),
  metal: metalSchema,
  fineness: z.string(),
  currency: z.literal('NPR'),
  buyRatePerTola: z.string(),
  sellRatePerTola: z.string(),
  gramsPerTola: z.string(),
  source: z.string(),
  reason: z.string(),
  revision: z.number().int().positive(),
  createdAt: z.iso.datetime(),
});
export type MetalRate = z.infer<typeof metalRateSchema>;
export const rateBookSchema = z.object({
  date: z.iso.date(),
  rates: z.array(metalRateSchema),
});
export type RateBook = z.infer<typeof rateBookSchema>;
export const rateHistorySchema = z.object({
  items: z.array(metalRateSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type RateHistory = z.infer<typeof rateHistorySchema>;
