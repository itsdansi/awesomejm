import { z } from 'zod';
import { nepalToday } from './rates.js';

export const accountDateSchema = z.iso
  .date()
  .refine(
    (value) => value >= '2000-01-01' && value <= nepalToday(),
    'Choose an AD date from 2000 through today in Nepal.',
  );
const amountSchema = z
  .string()
  .regex(
    /^(0|[1-9]\d{0,8})(\.\d{1,2})?$/,
    'Enter NPR with up to 2 decimal places.',
  );
const positiveAmountSchema = amountSchema.refine(
  (value) => Number(value) > 0,
  'Amount must be greater than zero.',
);
const phoneSchema = z
  .string()
  .trim()
  .max(30)
  .refine(
    (value) =>
      value === '' ||
      (/^\+?[\d ()-]+$/.test(value) &&
        value.replace(/\D/g, '').length >= 7 &&
        value.replace(/\D/g, '').length <= 15),
    'Enter 7–15 phone digits, optionally with a leading +.',
  )
  .transform((value) =>
    value
      ? `${value.startsWith('+') ? '+' : ''}${value.replace(/\D/g, '')}`
      : '',
  );
const profileFields = {
  name: z.string().trim().min(1, 'Enter a customer name.').max(120),
  phone: phoneSchema,
  address: z.string().trim().max(300),
  pan: z
    .string()
    .trim()
    .regex(/^(?:\d{9})?$/, 'PAN must contain 9 digits, or leave it blank.'),
  notes: z.string().trim().max(1000),
};
export const customerProfileSchema = z.object({
  ...profileFields,
  phone: profileFields.phone.default(''),
  address: profileFields.address.default(''),
  pan: profileFields.pan.default(''),
  notes: profileFields.notes.default(''),
});
export type CustomerProfile = z.infer<typeof customerProfileSchema>;
export const createCustomerSchema = customerProfileSchema
  .extend({
    requestId: z.uuid(),
    openedOn: accountDateSchema,
    openingType: z.enum(['NONE', 'DUE', 'ADVANCE']),
    openingAmountNpr: amountSchema,
    openingReference: z.string().trim().max(160).default(''),
  })
  .strict()
  .refine(
    (value) =>
      value.openingType === 'NONE'
        ? Number(value.openingAmountNpr) === 0
        : Number(value.openingAmountNpr) > 0,
    {
      path: ['openingAmountNpr'],
      message:
        'Use zero for a settled account, or a positive amount for opening dues/advance.',
    },
  )
  .refine(
    (value) =>
      value.openingType === 'NONE' || value.openingReference.length >= 5,
    {
      path: ['openingReference'],
      message:
        'Describe the source of the opening balance in at least 5 characters.',
    },
  );
export type CreateCustomer = z.infer<typeof createCustomerSchema>;
export const updateCustomerSchema = z
  .object({
    name: profileFields.name.optional(),
    phone: profileFields.phone.optional(),
    address: profileFields.address.optional(),
    pan: profileFields.pan.optional(),
    notes: profileFields.notes.optional(),
    expectedVersion: z.number().int().positive(),
    reason: z.string().trim().min(5).max(500),
  })
  .strict()
  .refine(
    (value) => Object.keys(profileFields).some((key) => key in value),
    'Include at least one profile field to update.',
  );
export type UpdateCustomer = z.infer<typeof updateCustomerSchema>;
export const customerQuerySchema = z.object({
  search: z.string().trim().max(120).default(''),
  balance: z.enum(['ALL', 'DUE', 'ADVANCE', 'SETTLED']).default('ALL'),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type CustomerQuery = z.infer<typeof customerQuerySchema>;
export const ledgerQuerySchema = z
  .object({
    from: accountDateSchema.optional(),
    to: accountDateSchema.optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    path: ['to'],
    message: 'End date must be on or after start date.',
  });
export type LedgerQuery = z.infer<typeof ledgerQuerySchema>;
export const accountPaymentSchema = z
  .object({
    requestId: z.uuid(),
    kind: z.enum(['PAYMENT', 'ADVANCE_REFUND']),
    entryDate: accountDateSchema,
    amountNpr: positiveAmountSchema,
    method: z.enum(['CASH', 'BANK', 'DIGITAL_WALLET']),
    reference: z.string().trim().max(160).default(''),
    notes: z.string().trim().max(500).default(''),
  })
  .strict();
export type AccountPayment = z.infer<typeof accountPaymentSchema>;
export const reverseAccountEntrySchema = z
  .object({
    requestId: z.uuid(),
    entryDate: accountDateSchema,
    reason: z
      .string()
      .trim()
      .min(5, 'Explain the correction in at least 5 characters.')
      .max(500),
  })
  .strict();
export type ReverseAccountEntry = z.infer<typeof reverseAccountEntrySchema>;

export const customerSchema = customerProfileSchema.extend({
  id: z.uuid(),
  customerCode: z.string(),
  openedOn: z.iso.date(),
  version: z.number().int(),
  balanceNpr: z.string(),
  latestEntryDate: z.iso.date(),
  createdAt: z.iso.datetime(),
});
export type Customer = z.infer<typeof customerSchema>;
export const customerListSchema = z.object({
  items: z.array(customerSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type CustomerList = z.infer<typeof customerListSchema>;
export const customerSummarySchema = z.object({
  customers: z.number().int(),
  receivableNpr: z.string(),
  advanceNpr: z.string(),
});
export type CustomerSummary = z.infer<typeof customerSummarySchema>;
export const customerDetailSchema = z.object({
  customer: customerSchema,
  profileHistory: z.array(
    z.object({
      version: z.number().int(),
      name: z.string(),
      phone: z.string(),
      address: z.string(),
      pan: z.string(),
      notes: z.string(),
      reason: z.string(),
      changedAt: z.iso.datetime(),
    }),
  ),
});
export type CustomerDetail = z.infer<typeof customerDetailSchema>;
const customerSnapshotSchema = z.object({
  customerCode: z.string(),
  name: z.string(),
  phone: z.string(),
  address: z.string(),
  pan: z.string(),
});
export const accountEntrySchema = z.object({
  id: z.uuid(),
  entryCode: z.string(),
  entryDate: z.iso.date(),
  kind: z.enum([
    'OPENING_DUE',
    'OPENING_ADVANCE',
    'PAYMENT',
    'ADVANCE_REFUND',
    'REVERSAL',
    'SALE_CHARGE',
  ]),
  amountNpr: z.string(),
  method: z.enum(['CASH', 'BANK', 'DIGITAL_WALLET']).nullable(),
  reference: z.string(),
  notes: z.string(),
  reversalOf: z.uuid().nullable(),
  reversed: z.boolean(),
  saleId: z.uuid().nullable(),
  orderId: z.uuid().nullable(),
  runningBalanceNpr: z.string(),
  customerSnapshot: customerSnapshotSchema,
  createdAt: z.iso.datetime(),
});
export type AccountEntry = z.infer<typeof accountEntrySchema>;
export const customerStatementSchema = z.object({
  customer: customerSchema,
  items: z.array(accountEntrySchema),
  openingBalanceNpr: z.string(),
  closingBalanceNpr: z.string(),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type CustomerStatement = z.infer<typeof customerStatementSchema>;
export const accountMutationSchema = z.object({
  entryId: z.uuid(),
  customer: customerSchema,
});
