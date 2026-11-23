import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { rolePermissions, type CurrentStaff } from '@awesomejm/contracts';
import { AuthContext } from '../src/auth/AuthContext';
import { DateFilter } from '../src/settings/DateFilter';

test('read-only BS date uses the shop calendar instead of falling back to AD', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const user: CurrentStaff = {
    id: '00000000-0000-4000-8000-000000000002',
    shopId: '00000000-4000-8000-8000-000000000001',
    username: 'bs-owner',
    name: 'BS owner',
    shopName: 'BS test shop',
    role: 'OWNER',
    permissions: rolePermissions('OWNER'),
    active: true,
    mustChangePassword: false,
    createdAt: '2026-10-26T00:00:00.000Z',
    displaySettings: {
      calendar: 'BS',
      timeZone: 'Asia/Kathmandu',
      hourCycle: 'h23',
    },
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => {
      root.render(
        <StrictMode>
          <AuthContext.Provider
            value={{ user, refresh: async () => {}, logout: async () => {} }}
          >
            <DateFilter
              label="Rate date"
              value="2026-11-24"
              max="2099-12-31"
              onChange={() => undefined}
              readOnly
            />
          </AuthContext.Provider>
        </StrictMode>,
      );
    });
    expect(host.textContent).toContain('2083-08-08');
    expect(host.textContent).toContain('Rate date');
    expect(host.textContent).toContain('BS');
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
