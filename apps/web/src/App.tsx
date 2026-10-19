import { Inventory } from './inventory/Inventory';
import { useEffect, useState } from 'react';
import { Rates } from './rates/Rates';
import { Customers } from './customers/Customers';

export function App() {
  const [route, setRoute] = useState(() => globalThis.location.hash);
  useEffect(() => {
    const navigate = () => setRoute(globalThis.location.hash);
    globalThis.addEventListener('hashchange', navigate);
    return () => globalThis.removeEventListener('hashchange', navigate);
  }, []);
  if (route.startsWith('#/customers'))
    return <Customers customerId={route.split('/')[2]} />;
  return route === '#/rates' ? <Rates /> : <Inventory />;
}
