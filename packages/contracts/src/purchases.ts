import { z } from 'zod';
import { accountDateSchema, customerSchema } from './customers.js';
import { receiveItemSchema } from './inventory.js';
import { metalRateSchema } from './rates.js';
import {
  saleDraftSchema,
  salePreviewSchema,
  saleDetailSchema,
} from './sales.js';
const money = z
  .string()
  .regex(
    /^(0|[1-9]\d{0,8})(\.\d{1,2})?$/,
    'Enter NPR with up to 2 decimal places.',
  );
const grams = z
  .string()
  .regex(
    /^(0|[1-9]\d{0,8})(\.\d{1,3})?$/,
    'Enter grams with up to 3 decimal places.',
  );
export const purchaseLineInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    metal: receiveItemSchema.shape.metal,
    fineness: receiveItemSchema.shape.fineness.transform((v) =>
      Number(v).toFixed(3),
    ),
    grossWeightGrams: receiveItemSchema.shape.grossWeightGrams,
    nonMetalWeightGrams: grams,
    deductedWeightGrams: grams,
    deductionNpr: money,
    deductionReason: z.string().trim().max(500).default(''),
    assayNotes: z.string().trim().min(3).max(500),
    rateId: z.uuid(),
  })
  .strict()
  .refine(
    (v) => Number(v.nonMetalWeightGrams) < Number(v.grossWeightGrams),
    'Stone/other weight must be less than gross weight.',
  )
  .refine(
    (v) =>
      !(Number(v.deductedWeightGrams) > 0 || Number(v.deductionNpr) > 0) ||
      v.deductionReason.length >= 5,
    'Explain deductions in at least five characters.',
  );
const fields = {
  customerId: z.uuid(),
  purchaseDate: accountDateSchema,
  lines: z.array(purchaseLineInputSchema).min(1).max(20),
  payoutNpr: money,
  payoutMethod: z.enum(['CASH', 'BANK', 'DIGITAL_WALLET']).nullable(),
  payoutReference: z.string().trim().max(160).default(''),
  reference: z.string().trim().max(160).default(''),
  notes: z.string().trim().max(500).default(''),
  sale: saleDraftSchema.nullable(),
};
const valid = (v: {
  customerId: string;
  purchaseDate: string;
  payoutNpr: string;
  payoutMethod: string | null;
  sale: { customerId: string; saleDate: string; paymentNpr: string } | null;
}) =>
  (Number(v.payoutNpr) > 0
    ? v.payoutMethod !== null
    : v.payoutMethod === null) &&
  (!v.sale ||
    (v.sale.customerId === v.customerId &&
      v.sale.saleDate === v.purchaseDate &&
      !(Number(v.sale.paymentNpr) > 0 && Number(v.payoutNpr) > 0)));
export const purchaseDraftSchema = z
  .object(fields)
  .strict()
  .refine(
    valid,
    'Use the same customer and date for the exchange. Choose a method for a payout; receive money or pay out, not both.',
  );
export type PurchaseDraft = z.infer<typeof purchaseDraftSchema>;
export const postPurchaseSchema = z
  .object({
    ...fields,
    requestId: z.uuid(),
    expectedPurchaseNpr: money,
    expectedSaleNpr: money,
    expectedCustomerVersion: z.number().int().positive(),
    expectedOrderVersion: z.number().int().positive().nullable().default(null),
    expectedBalanceNpr: z.string().regex(/^-?(0|[1-9]\d{0,29})(\.\d{1,2})?$/),
  })
  .strict()
  .refine(valid, 'Check exchange customer, date and settlement methods.');
export type PostPurchase = z.infer<typeof postPurchaseSchema>;
export const cancelPurchaseSchema = z
  .object({
    requestId: z.uuid(),
    cancellationDate: accountDateSchema,
    reason: z.string().trim().min(5).max(500),
    confirmStockInShop: z.literal(true),
  })
  .strict();
export type CancelPurchase = z.infer<typeof cancelPurchaseSchema>;
export const purchasesQuerySchema = z
  .object({
    search: z.string().trim().max(120).default(''),
    status: z.enum(['ALL', 'POSTED', 'CANCELLED']).default('ALL'),
    from: accountDateSchema.optional(),
    to: accountDateSchema.optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, 'Check the date range.');
export type PurchasesQuery = z.infer<typeof purchasesQuerySchema>;
export const purchaseLineSchema = z.object({
  ...purchaseLineInputSchema.shape,
  rate: metalRateSchema,
  netWeightGrams: z.string(),
  fineWeightGrams: z.string(),
  payableWeightGrams: z.string(),
  metalNpr: z.string(),
  totalNpr: z.string(),
  lotId: z.uuid(),
  lotCode: z.string(),
});
export const purchasePreviewSchema = z.object({
  customer: customerSchema,
  purchaseDate: z.iso.date(),
  lines: z.array(purchaseLineSchema.omit({ lotId: true, lotCode: true })),
  totalNpr: z.string(),
  sale: salePreviewSchema.nullable(),
  balanceBeforeNpr: z.string(),
  balanceAfterCreditNpr: z.string(),
  balanceAfterNpr: z.string(),
  maximumPayoutNpr: z.string(),
});
export type PurchasePreview = z.infer<typeof purchasePreviewSchema>;
export const purchaseRecordSchema = z.object({
  id: z.uuid(),
  purchaseCode: z.string(),
  customerId: z.uuid(),
  customerSnapshot: customerSchema.pick({
    name: true,
    customerCode: true,
    phone: true,
    address: true,
    pan: true,
  }),
  purchaseDate: z.iso.date(),
  totalNpr: z.string(),
  saleId: z.uuid().nullable(),
  payoutNpr: z.string(),
  payoutMethod: z.enum(['CASH', 'BANK', 'DIGITAL_WALLET']).nullable(),
  payoutReference: z.string(),
  reference: z.string(),
  notes: z.string(),
  balanceBeforeNpr: z.string(),
  balanceAfterNpr: z.string(),
  status: z.enum(['POSTED', 'CANCELLED']),
  createdAt: z.iso.datetime(),
  cancellationDate: z.iso.date().nullable(),
  cancellationReason: z.string().nullable(),
});
export const purchaseDetailSchema = z.object({
  purchase: purchaseRecordSchema,
  lines: z.array(purchaseLineSchema),
  sale: saleDetailSchema.nullable(),
});
export type PurchaseDetail = z.infer<typeof purchaseDetailSchema>;
export const purchasesListSchema = z.object({
  items: z.array(purchaseRecordSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
