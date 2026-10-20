import { z } from 'zod';
export const roleSchema = z.enum(['OWNER', 'MANAGER', 'CASHIER', 'VIEWER']);
export type StaffRole = z.infer<typeof roleSchema>;
export const permissions = [
  'workspace.read',
  'inventory.write',
  'rates.write',
  'customers.write',
  'sales.write',
  'orders.write',
  'purchases.write',
  'records.correct',
  'staff.manage',
] as const;
export type Permission = (typeof permissions)[number];
export function rolePermissions(role: StaffRole): Permission[] {
  if (role === 'OWNER') return [...permissions];
  if (role === 'MANAGER')
    return permissions.filter((p) => p !== 'staff.manage');
  if (role === 'CASHIER')
    return ['workspace.read', 'customers.write', 'sales.write', 'orders.write'];
  return ['workspace.read'];
}
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9][a-z0-9._-]{2,63}$/,
    'Use 3–64 letters, numbers, dots, underscores or hyphens.',
  );
export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters.')
  .max(128);
export const loginSchema = z
  .object({ username: usernameSchema, password: z.string().min(1).max(128) })
  .strict();
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    password: passwordSchema,
  })
  .strict()
  .refine((v) => v.currentPassword !== v.password, {
    message: 'Choose a different password.',
  });
export const createStaffSchema = z
  .object({
    username: usernameSchema,
    name: z.string().trim().min(1).max(120),
    role: roleSchema,
    password: passwordSchema,
  })
  .strict();
export const updateStaffSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    role: roleSchema,
    active: z.boolean(),
  })
  .strict();
export const resetPasswordSchema = z
  .object({ password: passwordSchema })
  .strict();
export const staffSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  name: z.string(),
  role: roleSchema,
  active: z.boolean(),
  mustChangePassword: z.boolean(),
  createdAt: z.iso.datetime(),
});
export const currentStaffSchema = staffSchema.extend({
  shopId: z.uuid(),
  shopName: z.string(),
  permissions: z.array(z.enum(permissions)),
});
export const sessionSchema = z.object({
  user: currentStaffSchema.nullable(),
  csrfToken: z.string().nullable(),
});
export const auditEventSchema = z.object({
  id: z.string(),
  occurredAt: z.iso.datetime(),
  actorName: z.string().nullable(),
  actorUsername: z.string().nullable(),
  action: z.string(),
  resource: z.string(),
  recordId: z.string().nullable(),
  details: z.record(z.string(), z.unknown()),
});
export const auditListSchema = z.object({
  items: z.array(auditEventSchema),
  page: z.number(),
  total: z.number(),
});
export const recoveryStatusSchema = z.object({
  backups: z.array(
    z.object({
      id: z.uuid(),
      fileName: z.string(),
      createdAt: z.iso.datetime(),
      sizeBytes: z.string(),
      sha256: z.string(),
      verifiedAt: z.iso.datetime().nullable(),
      tableCount: z.number().nullable(),
    }),
  ),
});
export type CurrentStaff = z.infer<typeof currentStaffSchema>;
export type Staff = z.infer<typeof staffSchema>;

export const staffListSchema = z.array(staffSchema);
export type AuditList = z.infer<typeof auditListSchema>;
export type RecoveryStatus = z.infer<typeof recoveryStatusSchema>;
