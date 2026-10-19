import { z } from 'zod';

const gramsSchema = z
  .string()
  .regex(
    /^(0|[1-9]\d{0,8})(\.\d{1,3})?$/,
    'Enter grams with up to 3 decimal places.',
  );
const positiveGramsSchema = gramsSchema.refine(
  (value) => Number(value) > 0,
  'Weight must be greater than zero.',
);
export const metalSchema = z.enum(['GOLD', 'SILVER']);
export const inventoryStatusSchema = z.enum(['AVAILABLE', 'VOIDED', 'SOLD']);

export const receiveItemSchema = z
  .object({
    itemCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(
        /^[A-Z0-9][A-Z0-9_-]{0,39}$/,
        'Use up to 40 letters, numbers, hyphens or underscores.',
      ),
    name: z.string().trim().min(1).max(120),
    category: z.string().trim().min(1).max(60),
    metal: metalSchema,
    fineness: z
      .string()
      .regex(/^\d{1,4}(\.\d{1,3})?$/, 'Enter purity in parts per thousand.')
      .refine(
        (value) => Number(value) > 0 && Number(value) <= 1000,
        'Purity must be greater than 0 and at most 1000.',
      ),
    grossWeightGrams: positiveGramsSchema,
    nonMetalWeightGrams: gramsSchema,
    notes: z.string().trim().max(1000).default(''),
  })
  .strict()
  .refine(
    (item) => Number(item.nonMetalWeightGrams) < Number(item.grossWeightGrams),
    {
      path: ['nonMetalWeightGrams'],
      message: 'Stone / other weight must be less than gross weight.',
    },
  );
export type ReceiveItem = z.infer<typeof receiveItemSchema>;

export const inventoryQuerySchema = z.object({
  search: z.string().trim().max(120).default(''),
  metal: metalSchema.optional(),
  status: inventoryStatusSchema.default('AVAILABLE'),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type InventoryQuery = z.infer<typeof inventoryQuerySchema>;
export const voidReceiptSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(5, 'Explain the correction in at least 5 characters.')
      .max(500),
  })
  .strict();

export const inventoryItemSchema = z.object({
  id: z.uuid(),
  itemCode: z.string(),
  name: z.string(),
  category: z.string(),
  metal: metalSchema,
  fineness: z.string(),
  grossWeightGrams: z.string(),
  nonMetalWeightGrams: z.string(),
  netWeightGrams: z.string(),
  fineWeightGrams: z.string(),
  gramsPerTola: z.string(),
  notes: z.string(),
  status: inventoryStatusSchema,
  activeSaleId: z.uuid().nullable(),
  receivedAt: z.iso.datetime(),
});
export type InventoryItem = z.infer<typeof inventoryItemSchema>;
export const inventoryListSchema = z.object({
  items: z.array(inventoryItemSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type InventoryList = z.infer<typeof inventoryListSchema>;
export const inventorySummarySchema = z.object({
  metals: z.array(
    z.object({
      metal: metalSchema,
      pieces: z.number().int(),
      netWeightGrams: z.string(),
      fineWeightGrams: z.string(),
    }),
  ),
});
export type InventorySummary = z.infer<typeof inventorySummarySchema>;
export const inventoryHistorySchema = z.array(
  z.object({
    id: z.uuid(),
    kind: z.enum(['RECEIPT', 'RECEIPT_VOID', 'SALE', 'SALE_CANCEL']),
    saleId: z.uuid().nullable(),
    netWeightGrams: z.string(),
    reason: z.string(),
    createdAt: z.iso.datetime(),
  }),
);
export type InventoryHistory = z.infer<typeof inventoryHistorySchema>;
