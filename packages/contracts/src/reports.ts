import { z } from 'zod';
import { accountDateSchema } from './customers.js';
export const reportsQuerySchema = z
  .object({
    from: accountDateSchema,
    to: accountDateSchema,
    groupBy: z.enum(['DAY', 'MONTH']).default('DAY'),
  })
  .strict()
  .refine((v) => v.from <= v.to, 'End date must be on or after start date.')
  .refine(
    (v) => (Date.parse(v.to) - Date.parse(v.from)) / 86400000 <= 365,
    'Choose a period of up to 366 days.',
  );
export type ReportsQuery = z.infer<typeof reportsQuerySchema>;
export const activityRowSchema = z.object({
  period: z.string(),
  postedSales: z.number().int(),
  cancelledSales: z.number().int(),
  salesNpr: z.string(),
  salesCorrectionsNpr: z.string(),
  netSalesNpr: z.string(),
  postedPurchases: z.number().int(),
  cancelledPurchases: z.number().int(),
  purchasesNpr: z.string(),
  purchaseCorrectionsNpr: z.string(),
  netPurchasesNpr: z.string(),
  receivedNpr: z.string(),
  paidNpr: z.string(),
  netCashNpr: z.string(),
});
export const stockRowSchema = z.object({
  stockClass: z.enum(['JEWELLERY', 'OLD_METAL']),
  metal: z.enum(['GOLD', 'SILVER']),
  fineness: z.string(),
  openingCount: z.number().int(),
  closingCount: z.number().int(),
  openingGrams: z.string(),
  receivedGrams: z.string(),
  issuedGrams: z.string(),
  correctionGrams: z.string(),
  closingGrams: z.string(),
  closingFineGrams: z.string(),
});
export const reportsSchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  groupBy: z.enum(['DAY', 'MONTH']),
  series: z.array(activityRowSchema),
  totals: activityRowSchema,
  stock: z.array(stockRowSchema),
  accounts: z.object({ duesNpr: z.string(), advancesNpr: z.string() }),
  methods: z.array(
    z.object({
      method: z.enum(['CASH', 'BANK', 'DIGITAL_WALLET']),
      receivedNpr: z.string(),
      paidNpr: z.string(),
      netCashNpr: z.string(),
    }),
  ),
});
export type BusinessReport = z.infer<typeof reportsSchema>;
export const dashboardSchema = z.object({
  date: z.iso.date(),
  today: activityRowSchema,
  month: activityRowSchema,
  stock: z.array(stockRowSchema),
  accounts: z.object({ duesNpr: z.string(), advancesNpr: z.string() }),
  orders: z.object({
    active: z.number().int(),
    ready: z.number().int(),
    overdue: z.number().int(),
  }),
  missingRates: z.number().int(),
  recent: z.array(
    z.object({
      id: z.uuid(),
      kind: z.enum(['SALE', 'PURCHASE']),
      code: z.string(),
      customerName: z.string(),
      date: z.iso.date(),
      totalNpr: z.string(),
      cancelled: z.boolean(),
    }),
  ),
});
