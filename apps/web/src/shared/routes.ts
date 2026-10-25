import type { Permission } from '@awesomejm/contracts';
import type { navigationKeys } from '../i18n/labels';

export type AppSection = keyof typeof navigationKeys;
type AppRoute = {
  section: AppSection;
  recordId?: string | undefined;
  orderId?: string | null;
};

export function resolveRoute(
  hash: string,
  permissions: readonly Permission[],
): AppRoute {
  const [path = '', query] = hash.split('?');
  const [, module, recordId] = path.split('/');
  const required =
    module === 'sales'
      ? 'sales.write'
      : module === 'purchases'
        ? 'purchases.write'
        : module === 'orders'
          ? 'orders.write'
          : null;
  if (recordId === 'new' && required && !permissions.includes(required))
    return { section: 'Account' };
  switch (module) {
    case 'customers':
      return { section: 'Customers', recordId };
    case 'purchases':
    case 'sales':
      return {
        section: module === 'sales' ? 'Sales' : 'Purchases',
        recordId,
        orderId: new URLSearchParams(query).get('orderId'),
      };
    case 'orders':
      return { section: 'Orders', recordId };
    case 'staff':
      return {
        section: permissions.includes('staff.manage')
          ? 'Staff & recovery'
          : 'Account',
      };
    case 'settings':
      return { section: 'Settings' };
    case 'account':
      return { section: 'Account' };
    case 'reports':
      return { section: 'Reports' };
    case 'rates':
      return { section: 'Metal rates' };
    case 'inventory':
      return { section: 'Inventory' };
    default:
      return { section: 'Dashboard' };
  }
}
