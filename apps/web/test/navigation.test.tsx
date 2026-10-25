import { act, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { rolePermissions, type CurrentStaff } from '@awesomejm/contracts';
import { App } from '../src/App';
import { AuthContext } from '../src/auth/AuthContext';
import { AppLoading } from '../src/i18n/AppLoading';

const inventoryLoad = vi.hoisted(() => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { pending, release, started: false };
});

// Keep the actual router and layout; replace page content and control its load.
vi.mock('../src/dashboard/Dashboard', () => ({
  Dashboard: () => <h1>Dashboard test page</h1>,
}));
vi.mock('../src/inventory/Inventory', async () => {
  inventoryLoad.started = true;
  await inventoryLoad.pending;
  return { Inventory: () => <h1>Inventory test page</h1> };
});

const owner: CurrentStaff = {
  id: '00000000-0000-4000-8000-000000000002',
  shopId: '00000000-0000-4000-8000-000000000001',
  username: 'navigation-owner',
  name: 'Navigation owner',
  shopName: 'Navigation test shop',
  role: 'OWNER',
  permissions: rolePermissions('OWNER'),
  active: true,
  mustChangePassword: false,
  createdAt: '2026-10-26T00:00:00.000Z',
  displaySettings: {
    calendar: 'AD',
    timeZone: 'Asia/Kathmandu',
    hourCycle: 'h23',
  },
};

async function navigate(action: () => void) {
  await act(async () => {
    const changed = new Promise<void>((resolve) => {
      window.addEventListener('hashchange', () => resolve(), { once: true });
    });
    action();
    await changed;
  });
}

test('navigation preserves the layout and current page during a delayed module load', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  window.history.replaceState(null, '', '#/dashboard');
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => {
      root.render(
        <StrictMode>
          <Suspense fallback={<AppLoading />}>
            <AuthContext.Provider
              value={{
                user: owner,
                refresh: async () => {},
                logout: async () => {},
              }}
            >
              <App />
            </AuthContext.Provider>
          </Suspense>
        </StrictMode>,
      );
    });
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    expect(host.querySelector('h1')?.textContent).toBe('Dashboard test page');

    const sidebar = host.querySelector('.sidebar');
    const topbar = host.querySelector('.topbar');
    const avatar = host.querySelector('.user-avatar');
    const inventoryLink = host.querySelector<HTMLAnchorElement>(
      '.sidebar a[href="#/inventory"]',
    );
    expect(sidebar).not.toBeNull();
    expect(topbar).not.toBeNull();
    expect(avatar).not.toBeNull();
    expect(inventoryLink).not.toBeNull();

    function expectSameLayout() {
      expect(host.querySelectorAll('.app-shell')).toHaveLength(1);
      expect(host.querySelector('.sidebar')).toBe(sidebar);
      expect(host.querySelector('.topbar')).toBe(topbar);
      expect(host.querySelector('.user-avatar')).toBe(avatar);
      expect(host.querySelector('.app-loading')).toBeNull();
    }

    await navigate(() => inventoryLink!.click());
    await vi.waitFor(() => expect(inventoryLoad.started).toBe(true));
    expectSameLayout();
    expect(host.querySelector('h1')?.textContent).toBe('Dashboard test page');
    expect(host.querySelector('.workspace-loading')).toBeNull();
    expect(host.querySelector('main')?.getAttribute('aria-busy')).toBe('true');

    await act(async () => {
      inventoryLoad.release();
      await vi.dynamicImportSettled();
    });
    expect(host.querySelector('h1')?.textContent).toBe('Inventory test page');
    expectSameLayout();
    expect(host.querySelector('main')?.getAttribute('aria-busy')).toBe('false');
    expect(inventoryLink!.getAttribute('aria-current')).toBe('page');

    await navigate(() => window.history.back());
    expect(host.querySelector('h1')?.textContent).toBe('Dashboard test page');
    expectSameLayout();
  } finally {
    inventoryLoad.release();
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
