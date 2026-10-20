import { z } from 'zod';
import { accountDateSchema, customerSchema } from './customers.js';
import { receiveItemSchema } from './inventory.js';

const amount = z
  .string()
  .regex(
    /^(0|[1-9]\d{0,8})(\.\d{1,2})?$/,
    'Enter NPR with up to 2 decimal places.',
  );
export const orderStatusSchema = z.enum([
  'BOOKED',
  'IN_PROGRESS',
  'READY',
  'DELIVERED',
  'CANCELLED',
]);
export const orderLineSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    design: z.string().trim().min(1).max(500),
    size: z.string().trim().max(120),
    metal: receiveItemSchema.shape.metal,
    fineness: receiveItemSchema.shape.fineness.transform((value) =>
      Number(value).toFixed(3),
    ),
    quantity: z.number().int().min(1).max(20),
    expectedNetWeightGrams: receiveItemSchema.shape.grossWeightGrams,
    plannedWastageGrams: z
      .string()
      .regex(
        /^(0|[1-9]\d{0,8})(\.\d{1,3})?$/,
        'Enter billed wastage in grams, up to 3 decimal places.',
      )
      .default('0'),
    plannedMakingNpr: amount.default('0'),
    plannedStonesNpr: amount.default('0'),
  })
  .strict();
const paymentFields = {
  amountNpr: amount,
  method: z.enum(['CASH', 'BANK', 'DIGITAL_WALLET']).nullable(),
  reference: z.string().trim().max(160).default(''),
};
export const createOrderSchema = z
  .object({
    requestId: z.uuid(),
    customerId: z.uuid(),
    orderDate: accountDateSchema,
    dueDate: z.iso
      .date()
      .refine(
        (value) => value >= '2000-01-01' && value <= '2099-12-31',
        'Choose a delivery date from 2000 through 2099.',
      ),
    lines: z.array(orderLineSchema).min(1).max(20),
    estimatedTotalNpr: amount.nullable(),
    notes: z.string().trim().max(1000).default(''),
    deposit: z.object(paymentFields).strict(),
  })
  .strict()
  .refine(
    (value) => value.dueDate >= value.orderDate,
    'Delivery date cannot precede the order date.',
  )
  .refine(
    (value) =>
      value.lines.reduce((total, line) => total + line.quantity, 0) <= 20,
    'An order can contain up to 20 pieces.',
  )
  .refine(
    (value) =>
      Number(value.deposit.amountNpr) > 0
        ? value.deposit.method !== null
        : value.deposit.method === null,
    'Select a payment method only when an advance is received.',
  );
export type CreateOrder = z.infer<typeof createOrderSchema>;
export const orderPaymentSchema = z
  .object({
    requestId: z.uuid(),
    entryDate: accountDateSchema,
    ...paymentFields,
    amountNpr: amount.refine(
      (value) => Number(value) > 0,
      'Amount must be positive.',
    ),
    method: z.enum(['CASH', 'BANK', 'DIGITAL_WALLET']),
    notes: z.string().trim().max(500).default(''),
  })
  .strict();
export type OrderPayment = z.infer<typeof orderPaymentSchema>;
export const updateOrderStatusSchema = z
  .object({
    requestId: z.uuid(),
    expectedVersion: z.number().int().positive(),
    status: z.enum(['IN_PROGRESS', 'READY', 'CANCELLED']),
    eventDate: accountDateSchema,
    reason: z.string().trim().min(5).max(500),
  })
  .strict();
export type UpdateOrderStatus = z.infer<typeof updateOrderStatusSchema>;
export const ordersQuerySchema = z.object({
  search: z.string().trim().max(120).default(''),
  status: z
    .enum([
      'ALL',
      'ACTIVE',
      'BOOKED',
      'IN_PROGRESS',
      'READY',
      'DELIVERED',
      'CANCELLED',
    ])
    .default('ACTIVE'),
  overdue: z.enum(['true', 'false']).default('false'),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type OrdersQuery = z.infer<typeof ordersQuerySchema>;
export const orderRecordSchema = z.object({
  id: z.uuid(),
  orderCode: z.string(),
  customerId: z.uuid(),
  customerSnapshot: customerSchema.pick({
    customerCode: true,
    name: true,
    phone: true,
    address: true,
    pan: true,
  }),
  orderDate: z.iso.date(),
  dueDate: z.iso.date(),
  lines: z.array(orderLineSchema),
  estimatedTotalNpr: z.string().nullable(),
  notes: z.string(),
  status: orderStatusSchema,
  version: z.number().int().positive(),
  latestActivityDate: z.iso.date(),
  activeSaleId: z.uuid().nullable(),
  taggedPaymentsNpr: z.string(),
  pieceCount: z.number().int(),
  overdue: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type OrderRecord = z.infer<typeof orderRecordSchema>;
export const orderEventSchema = z.object({
  id: z.uuid(),
  version: z.number().int(),
  kind: z.enum(['CREATED', 'STATUS', 'SALE_DELIVERED', 'SALE_REOPENED']),
  status: orderStatusSchema,
  eventDate: z.iso.date(),
  reason: z.string(),
  saleId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
});
export const orderPaymentRecordSchema = z.object({
  id: z.uuid(),
  entryCode: z.string(),
  entryDate: z.iso.date(),
  kind: z.enum(['PAYMENT', 'REVERSAL']),
  amountNpr: z.string(),
  method: z.enum(['CASH', 'BANK', 'DIGITAL_WALLET']).nullable(),
  reference: z.string(),
  notes: z.string(),
  reversed: z.boolean(),
});
export const orderDetailSchema = z.object({
  order: orderRecordSchema,
  customer: customerSchema,
  events: z.array(orderEventSchema),
  payments: z.array(orderPaymentRecordSchema),
});
export type OrderDetail = z.infer<typeof orderDetailSchema>;
export const ordersListSchema = z.object({
  items: z.array(orderRecordSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export const ordersSummarySchema = z.object({
  active: z.number().int(),
  ready: z.number().int(),
  overdue: z.number().int(),
});
