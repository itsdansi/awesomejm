import { Inventory } from './inventory/Inventory';
import { useEffect, useState } from 'react';
import { Rates } from './rates/Rates';

export function App() {
  const [route, setRoute] = useState(() => globalThis.location.hash);
  useEffect(() => {
    const navigate = () => setRoute(globalThis.location.hash);
    globalThis.addEventListener('hashchange', navigate);
    return () => globalThis.removeEventListener('hashchange', navigate);
  }, []);
  return route === '#/rates' ? <Rates /> : <Inventory />;
}
