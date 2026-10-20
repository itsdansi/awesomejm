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
  if (path?.startsWith('#/orders'))
    return <Orders orderId={path.split('/')[2]} />;
  if (path?.startsWith('#/sales'))
    return (
      <Sales
        saleId={path.split('/')[2]}
        orderId={new URLSearchParams(query).get('orderId')}
      />
    );
  return route === '#/rates' ? <Rates /> : <Inventory />;
}
