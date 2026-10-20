import { z } from 'zod';
import { accountDateSchema, customerSchema } from './customers.js';
import { inventoryItemSchema } from './inventory.js';
import { metalRateSchema } from './rates.js';

const money = z
  .string()
  .regex(
    /^(0|[1-9]\d{0,8})(\.\d{1,2})?$/,
    'Enter NPR with up to 2 decimal places.',
  );
const lineInput = z
  .object({
    itemId: z.uuid(),
    rateId: z.uuid(),
    wastageGrams: z
      .string()
      .regex(
        /^(0|[1-9]\d{0,8})(\.\d{1,3})?$/,
        'Enter billed wastage in grams, up to 3 decimal places.',
      ),
    makingNpr: money,
    stonesNpr: money,
  })
  .strict();
const draftFields = {
  customerId: z.uuid(),
  orderId: z.uuid().nullable().default(null),
  saleDate: accountDateSchema,
  lines: z.array(lineInput).min(1).max(20),
  discountNpr: money,
  taxNpr: money,
  paymentNpr: money,
  paymentMethod: z.enum(['CASH', 'BANK', 'DIGITAL_WALLET']).nullable(),
  paymentReference: z.string().trim().max(160).default(''),
  billReference: z.string().trim().max(160).default(''),
  notes: z.string().trim().max(500).default(''),
};
const validDraft = (value: {
  lines: { itemId: string }[];
  paymentNpr: string;
  paymentMethod: string | null;
}) =>
  new Set(value.lines.map((line) => line.itemId)).size === value.lines.length &&
  (Number(value.paymentNpr) > 0
    ? value.paymentMethod !== null
    : value.paymentMethod === null);
const draftMessage =
  'Use each piece once. Select a payment method only when money is received for this sale.';
export const saleDraftSchema = z
  .object(draftFields)
  .strict()
  .refine(validDraft, draftMessage);
export type SaleDraft = z.infer<typeof saleDraftSchema>;
export const postSaleSchema = z
  .object({
    ...draftFields,
    requestId: z.uuid(),
    expectedOrderVersion: z.number().int().positive().nullable().default(null),
    expectedTotalNpr: money,
    expectedCustomerVersion: z.number().int().positive(),
    expectedBalanceNpr: z.string().regex(/^-?(0|[1-9]\d{0,29})(\.\d{1,2})?$/),
  })
  .strict()
  .refine(validDraft, draftMessage);
export type PostSale = z.infer<typeof postSaleSchema>;
export const cancelSaleSchema = z
  .object({
    requestId: z.uuid(),
    cancellationDate: accountDateSchema,
    reason: z.string().trim().min(5).max(500),
    confirmStockInShop: z.literal(true),
  })
  .strict();
export type CancelSale = z.infer<typeof cancelSaleSchema>;
export const salesQuerySchema = z
  .object({
    search: z.string().trim().max(120).default(''),
    status: z.enum(['ALL', 'POSTED', 'CANCELLED']).default('ALL'),
    from: accountDateSchema.optional(),
    to: accountDateSchema.optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine(
    (value) => !value.from || !value.to || value.from <= value.to,
    'End date must be on or after start date.',
  );
export type SalesQuery = z.infer<typeof salesQuerySchema>;
export const saleItemSnapshotSchema = inventoryItemSchema.omit({
  status: true,
  activeSaleId: true,
  notes: true,
  receivedAt: true,
});
const lineAmounts = {
  metalNpr: z.string(),
  wastageNpr: z.string(),
  makingNpr: z.string(),
  stonesNpr: z.string(),
  lineTotalNpr: z.string(),
};
export const saleLineSchema = z.object({
  item: saleItemSnapshotSchema,
  rate: metalRateSchema,
  wastageGrams: z.string(),
  ...lineAmounts,
});
const totals = {
  subtotalNpr: z.string(),
  discountNpr: z.string(),
  taxNpr: z.string(),
  totalNpr: z.string(),
  paymentNpr: z.string(),
  advanceAppliedNpr: z.string(),
  dueAtPostingNpr: z.string(),
  balanceBeforeNpr: z.string(),
  balanceAfterNpr: z.string(),
};
export const salePreviewSchema = z.object({
  customer: customerSchema,
  order: z
    .object({
      id: z.uuid(),
      orderCode: z.string(),
      version: z.number().int().positive(),
    })
    .nullable(),
  saleDate: z.iso.date(),
  lines: z.array(saleLineSchema),
  ...totals,
});
export type SalePreview = z.infer<typeof salePreviewSchema>;
export const saleRecordSchema = z.object({
  id: z.uuid(),
  saleCode: z.string(),
  orderId: z.uuid().nullable(),
  saleDate: z.iso.date(),
  customerId: z.uuid(),
  customerSnapshot: z.object({
    customerCode: z.string(),
    name: z.string(),
    phone: z.string(),
    address: z.string(),
    pan: z.string(),
  }),
  ...totals,
  paymentMethod: z.enum(['CASH', 'BANK', 'DIGITAL_WALLET']).nullable(),
  paymentReference: z.string(),
  billReference: z.string(),
  notes: z.string(),
  status: z.enum(['POSTED', 'CANCELLED']),
  createdAt: z.iso.datetime(),
  cancellationDate: z.iso.date().nullable(),
  cancellationReason: z.string().nullable(),
  cancelledAt: z.iso.datetime().nullable(),
});
export type SaleRecord = z.infer<typeof saleRecordSchema>;
export const saleDetailSchema = z.object({
  sale: saleRecordSchema,
  lines: z.array(saleLineSchema),
});
export type SaleDetail = z.infer<typeof saleDetailSchema>;
export const salesListSchema = z.object({
  items: z.array(saleRecordSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type SalesList = z.infer<typeof salesListSchema>;
export const salesSummarySchema = z.object({
  posted: z.number().int(),
  cancelled: z.number().int(),
  postedTotalNpr: z.string(),
});
export type SalesSummary = z.infer<typeof salesSummarySchema>;
