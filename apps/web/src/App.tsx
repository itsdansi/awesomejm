import { Account } from './auth/Account';
import { useAuth } from './auth/AuthContext';
const Staff = lazy(() =>
  import('./staff/Staff').then((m) => ({ default: m.Staff })),
);
import { lazy } from 'react';
const Dashboard = lazy(() =>
  import('./dashboard/Dashboard').then((module) => ({
    default: module.Dashboard,
  })),
);
const Reports = lazy(() =>
  import('./reports/Reports').then((module) => ({ default: module.Reports })),
);
const Purchases = lazy(() =>
  import('./purchases/Purchases').then((module) => ({
    default: module.Purchases,
  })),
);
const Inventory = lazy(() =>
  import('./inventory/Inventory').then((module) => ({
    default: module.Inventory,
  })),
);
import { useEffect, useState } from 'react';
const Rates = lazy(() =>
  import('./rates/Rates').then((module) => ({ default: module.Rates })),
);
const Customers = lazy(() =>
  import('./customers/Customers').then((module) => ({
    default: module.Customers,
  })),
);
const Orders = lazy(() =>
  import('./orders/Orders').then((module) => ({ default: module.Orders })),
);
const Sales = lazy(() =>
  import('./sales/Sales').then((module) => ({ default: module.Sales })),
);

export function App() {
  const [route, setRoute] = useState(() => globalThis.location.hash);
  useEffect(() => {
    const navigate = () => setRoute(globalThis.location.hash);
    globalThis.addEventListener('hashchange', navigate);
    return () => globalThis.removeEventListener('hashchange', navigate);
  }, []);
  const { can } = useAuth();
  if (route === '#/account') return <Account />;
  if (route === '#/staff') return can('staff.manage') ? <Staff /> : <Account />;
  const required = route.startsWith('#/sales/new')
    ? 'sales.write'
    : route.startsWith('#/purchases/new')
      ? 'purchases.write'
      : route.startsWith('#/orders/new')
        ? 'orders.write'
        : null;
  if (required && !can(required)) return <Account />;
  if (route.startsWith('#/customers'))
    return <Customers customerId={route.split('/')[2]} />;
  const [path, query] = route.split('?');
  if (path?.startsWith('#/purchases'))
    return (
      <Purchases
        purchaseId={path.split('/')[2]}
        orderId={new URLSearchParams(query).get('orderId')}
      />
    );
  if (path === '#/reports') return <Reports />;
  if (path?.startsWith('#/orders'))
    return <Orders orderId={path.split('/')[2]} />;
  if (path?.startsWith('#/sales'))
    return (
      <Sales
        saleId={path.split('/')[2]}
        orderId={new URLSearchParams(query).get('orderId')}
      />
    );
  if (route === '#/rates') return <Rates />;
  return route === '#/inventory' ? <Inventory /> : <Dashboard />;
}
