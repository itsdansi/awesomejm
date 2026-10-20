import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Application root is missing.');

createRoot(root).render(
  <StrictMode>
    <Suspense
      fallback={
        <div className="app-loading" role="status">
          Loading workspace…
        </div>
      }
    >
      <App />
    </Suspense>
  </StrictMode>,
);
