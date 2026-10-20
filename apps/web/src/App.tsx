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
import { Inventory } from './inventory/Inventory';
import { useEffect, useState } from 'react';
import { Rates } from './rates/Rates';
import { Customers } from './customers/Customers';
import { Orders } from './orders/Orders';
import { Sales } from './sales/Sales';

export function App() {
  const [route, setRoute] = useState(() => globalThis.location.hash);
  useEffect(() => {
    const navigate = () => setRoute(globalThis.location.hash);
    globalThis.addEventListener('hashchange', navigate);
    return () => globalThis.removeEventListener('hashchange', navigate);
  }, []);
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
