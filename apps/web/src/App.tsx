import { Account } from './auth/Account';
import { useAuth } from './auth/AuthContext';
import { lazy, Suspense, useEffect, useState, useTransition } from 'react';
import { AppShell } from './shared/AppShell';
import { resolveRoute } from './shared/routes';
import { AppLoading } from './i18n/AppLoading';

const Staff = lazy(() =>
  import('./staff/Staff').then((m) => ({ default: m.Staff })),
);
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

const Settings = lazy(() =>
  import('./settings/Settings').then((m) => ({ default: m.Settings })),
);

export function App() {
  const [route, setRoute] = useState(() => globalThis.location.hash);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    const navigate = () => {
      const nextRoute = globalThis.location.hash;
      startTransition(() => setRoute(nextRoute));
    };
    globalThis.addEventListener('hashchange', navigate);
    return () => globalThis.removeEventListener('hashchange', navigate);
  }, [startTransition]);
  const { user } = useAuth();
  const page = resolveRoute(route, user.permissions);
  let content;
  switch (page.section) {
    case 'Settings':
      content = <Settings />;
      break;
    case 'Account':
      content = <Account />;
      break;
    case 'Staff & recovery':
      content = <Staff />;
      break;
    case 'Customers':
      content = <Customers customerId={page.recordId} />;
      break;
    case 'Purchases':
      content = (
        <Purchases purchaseId={page.recordId} orderId={page.orderId ?? null} />
      );
      break;
    case 'Reports':
      content = <Reports />;
      break;
    case 'Orders':
      content = <Orders orderId={page.recordId} />;
      break;
    case 'Sales':
      content = <Sales saleId={page.recordId} orderId={page.orderId ?? null} />;
      break;
    case 'Metal rates':
      content = <Rates />;
      break;
    case 'Inventory':
      content = <Inventory />;
      break;
    default:
      content = <Dashboard />;
  }
  return (
    <AppShell section={page.section} busy={pending}>
      <Suspense fallback={<AppLoading withinWorkspace />}>{content}</Suspense>
    </AppShell>
  );
}
