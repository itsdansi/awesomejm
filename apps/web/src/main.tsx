import { FormValidation } from './i18n/FormValidation';
import { AppLoading } from './i18n/AppLoading';
import { AuthGate } from './auth/AuthGate';
import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Application root is missing.');

createRoot(root).render(
  <StrictMode>
    <FormValidation />
    <Suspense fallback={<AppLoading />}>
      <AuthGate>
        <App />
      </AuthGate>
    </Suspense>
  </StrictMode>,
);
