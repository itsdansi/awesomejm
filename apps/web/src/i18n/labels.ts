import type { StaffRole } from '@awesomejm/contracts';
import type { TranslationKey } from './schema';

export const roleKeys = {
  OWNER: 'common.roles.owner',
  MANAGER: 'common.roles.manager',
  CASHIER: 'common.roles.cashier',
  VIEWER: 'common.roles.viewer',
} as const satisfies Record<StaffRole, TranslationKey>;
export const navigationKeys = {
  Dashboard: 'common.navigation.dashboard',
  Inventory: 'common.navigation.inventory',
  'Metal rates': 'common.navigation.rates',
  Customers: 'common.navigation.customers',
  Sales: 'common.navigation.sales',
  Orders: 'common.navigation.orders',
  Purchases: 'common.navigation.purchases',
  Reports: 'common.navigation.reports',
  Account: 'common.navigation.account',
  Settings: 'settings.title',
  'Staff & recovery': 'common.navigation.staff',
} as const satisfies Record<string, TranslationKey>;
