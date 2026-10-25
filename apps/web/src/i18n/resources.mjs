import enPurity from './locales/en/purity.json' with { type: 'json' };
import nePurity from './locales/ne/purity.json' with { type: 'json' };
import enWeights from './locales/en/weights.json' with { type: 'json' };
import neWeights from './locales/ne/weights.json' with { type: 'json' };
import enSettings from './locales/en/settings.json' with { type: 'json' };
import neSettings from './locales/ne/settings.json' with { type: 'json' };
import enAuth from './locales/en/auth.json' with { type: 'json' };
import enCommon from './locales/en/common.json' with { type: 'json' };
import enCustomers from './locales/en/customers.json' with { type: 'json' };
import enDashboard from './locales/en/dashboard.json' with { type: 'json' };
import enErrors from './locales/en/errors.json' with { type: 'json' };
import enInventory from './locales/en/inventory.json' with { type: 'json' };
import enOrders from './locales/en/orders.json' with { type: 'json' };
import enPurchases from './locales/en/purchases.json' with { type: 'json' };
import enRates from './locales/en/rates.json' with { type: 'json' };
import enReports from './locales/en/reports.json' with { type: 'json' };
import enSales from './locales/en/sales.json' with { type: 'json' };
import enStaff from './locales/en/staff.json' with { type: 'json' };
import enValidation from './locales/en/validation.json' with { type: 'json' };
import neAuth from './locales/ne/auth.json' with { type: 'json' };
import neCommon from './locales/ne/common.json' with { type: 'json' };
import neCustomers from './locales/ne/customers.json' with { type: 'json' };
import neDashboard from './locales/ne/dashboard.json' with { type: 'json' };
import neErrors from './locales/ne/errors.json' with { type: 'json' };
import neInventory from './locales/ne/inventory.json' with { type: 'json' };
import neOrders from './locales/ne/orders.json' with { type: 'json' };
import nePurchases from './locales/ne/purchases.json' with { type: 'json' };
import neRates from './locales/ne/rates.json' with { type: 'json' };
import neReports from './locales/ne/reports.json' with { type: 'json' };
import neSales from './locales/ne/sales.json' with { type: 'json' };
import neStaff from './locales/ne/staff.json' with { type: 'json' };
import neValidation from './locales/ne/validation.json' with { type: 'json' };

// Register each namespace explicitly so the same resources work in Vite and Node tests.
export const resources = {
  en: {
    purity: enPurity,
    weights: enWeights,
    settings: enSettings,
    auth: enAuth,
    common: enCommon,
    customers: enCustomers,
    dashboard: enDashboard,
    errors: enErrors,
    inventory: enInventory,
    orders: enOrders,
    purchases: enPurchases,
    rates: enRates,
    reports: enReports,
    sales: enSales,
    staff: enStaff,
    validation: enValidation,
  },
  ne: {
    purity: nePurity,
    weights: neWeights,
    settings: neSettings,
    auth: neAuth,
    common: neCommon,
    customers: neCustomers,
    dashboard: neDashboard,
    errors: neErrors,
    inventory: neInventory,
    orders: neOrders,
    purchases: nePurchases,
    rates: neRates,
    reports: neReports,
    sales: neSales,
    staff: neStaff,
    validation: neValidation,
  },
};
