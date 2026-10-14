import { useEffect, useState } from 'react';
import {
  healthResponseSchema,
  type HealthResponse,
} from '@awesomejm/contracts';
import { tolaToGrams } from '@awesomejm/calculations';

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function checkHealth() {
      try {
        const response = await fetch('/api/v1/health', {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('API health check failed.');
        const data: unknown = await response.json();
        if (!controller.signal.aborted) {
          setHealth(healthResponseSchema.parse(data));
        }
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    }
    void checkHealth();
    return () => controller.abort();
  }, []);

  return (
    <main className="workspace">
      <header className="brand">
        <span className="brand-mark" aria-hidden="true">
          A
        </span>
        <span>AwesomeJM</span>
        <span className="workspace-label">Development workspace</span>
      </header>

      <section className="intro">
        <p className="eyebrow">Built for Nepali jewellery businesses</p>
        <h1>A foundation for your shop.</h1>
        <p className="description">
          Stock, orders, exchanges and customer accounts will come together
          here. Your frontend and API are ready for the first workflow.
        </p>
      </section>

      <section className="cards" aria-label="Workspace checks">
        <article className="card">
          <p className="eyebrow">Backend connection</p>
          <div className="connection" role="status" aria-live="polite">
            <span className={`status-dot ${health ? 'connected' : ''}`} />
            <h2>
              {health
                ? 'API connected'
                : failed
                  ? 'API unavailable'
                  : 'Connecting…'}
            </h2>
          </div>
          <p>
            {health
              ? `Running on Node.js ${health.nodeVersion.replace(/^v/, '')}`
              : failed
                ? 'Start the workspace with pnpm dev to connect the API.'
                : 'Checking the backend connection.'}
          </p>
        </article>
        <article className="card">
          <p className="eyebrow">Weight conversion</p>
          <h2>1 tola = {tolaToGrams('1')} g</h2>
          <p>The first shop’s conversion, ready for confirmation.</p>
        </article>
      </section>

      <footer>सुनचाँदी व्यवसायको लागि · Made for your everyday work</footer>
    </main>
  );
}
