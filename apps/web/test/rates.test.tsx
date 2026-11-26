import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  nepalToday,
  parseFenegosidaRates,
  rolePermissions,
  type CurrentStaff,
  type MetalRate,
} from '@awesomejm/contracts';
import { AuthContext } from '../src/auth/AuthContext';
import { Rates } from '../src/rates/Rates';

const makeUser = (role: CurrentStaff['role']): CurrentStaff => ({
  id: '00000000-0000-4000-8000-000000000002',
  shopId: '00000000-0000-4000-8000-000000000001',
  username: `rates-${role.toLowerCase()}`,
  name: `Rates ${role}`,
  shopName: 'Rates test shop',
  role,
  permissions: rolePermissions(role),
  active: true,
  mustChangePassword: false,
  createdAt: '2026-10-26T00:00:00.000Z',
  displaySettings: {
    calendar: 'AD',
    timeZone: 'Asia/Kathmandu',
    hourCycle: 'h23',
  },
});

const makeRate = (
  metal: 'GOLD' | 'SILVER',
  amount: string,
  revision = 1,
): MetalRate => ({
  id:
    metal === 'GOLD'
      ? '00000000-0000-4000-8000-000000000011'
      : '00000000-0000-4000-8000-000000000012',
  rateDate: nepalToday(),
  metal,
  fineness: '999.000',
  currency: 'NPR',
  buyRatePerTola: amount,
  sellRatePerTola: amount,
  gramsPerTola: '11.66400',
  source: 'FENEGOSIDA (2026-11-25)',
  reason: revision === 1 ? '' : 'Updated from latest FENEGOSIDA rate',
  revision,
  createdAt: '2026-11-25T05:00:00.000Z',
});

describe('Rates page live fetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('fetches and updates gold and silver rates for today', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    let synced = false;
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (
          url.startsWith('/api/v1/rates/fetch-latest') &&
          init?.method === 'POST'
        ) {
          synced = true;
          return new Response(
            JSON.stringify({
              rateDate: nepalToday(),
              sourceDate: '2026-11-25',
              source: 'FENEGOSIDA (2026-11-25)',
              gold: makeRate('GOLD', '241400.00', 2),
              silver: makeRate('SILVER', '3040.00', 2),
              goldAction: 'updated',
              silverAction: 'updated',
            }),
            { status: 201, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (url.startsWith('/api/v1/rates/history')) {
          const items = synced
            ? [
                makeRate('GOLD', '241400.00', 2),
                makeRate('SILVER', '3040.00', 2),
              ]
            : [];
          return new Response(
            JSON.stringify({
              items,
              total: items.length,
              page: 1,
              pageSize: 10,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        const rates = synced
          ? [makeRate('GOLD', '241400.00', 2), makeRate('SILVER', '3040.00', 2)]
          : [];
        return new Response(
          JSON.stringify({
            date: nepalToday(),
            rates,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => {
        root.render(
          <StrictMode>
            <AuthContext.Provider
              value={{
                user: makeUser('OWNER'),
                refresh: async () => {},
                logout: async () => {},
              }}
            >
              <Rates />
            </AuthContext.Provider>
          </StrictMode>,
        );
      });

      const fetchButton = Array.from(host.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Fetch latest rates'),
      );
      expect(fetchButton).toBeDefined();

      await act(async () => {
        fetchButton!.click();
      });

      expect(
        fetchMock.mock.calls.some(([url, init]) => {
          const headers = new Headers(init?.headers);
          return (
            String(url) === '/api/v1/rates/fetch-latest' &&
            init?.method === 'POST' &&
            headers.get('Content-Type') === 'application/json' &&
            headers.get('X-AwesomeJM-Request') === '1' &&
            init?.body === '{}'
          );
        }),
      ).toBe(true);

      const status = host.querySelector('[role="status"]');
      expect(status?.textContent).toContain('241,400.00');
      expect(status?.textContent).toContain('3,040.00');
      expect(host.textContent).toContain('FENEGOSIDA (2026-11-25)');
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });

  test('shows error banner on upstream fetch failure and hides button without rates.write', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (
          url.startsWith('/api/v1/rates/fetch-latest') &&
          init?.method === 'POST'
        ) {
          return new Response(
            JSON.stringify({
              message:
                'Could not fetch latest rates from FENEGOSIDA. Please try again or set rates manually.',
            }),
            { status: 502, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (url.startsWith('/api/v1/rates/history')) {
          return new Response(
            JSON.stringify({ items: [], total: 0, page: 1, pageSize: 10 }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(JSON.stringify({ date: nepalToday(), rates: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );

    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => {
        root.render(
          <StrictMode>
            <AuthContext.Provider
              value={{
                user: makeUser('OWNER'),
                refresh: async () => {},
                logout: async () => {},
              }}
            >
              <Rates />
            </AuthContext.Provider>
          </StrictMode>,
        );
      });

      const fetchButton = Array.from(host.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Fetch latest rates'),
      );
      await act(async () => {
        fetchButton!.click();
      });

      const alert = host.querySelector('[role="alert"]');
      expect(alert?.textContent).toContain(
        'Could not fetch latest rates from FENEGOSIDA',
      );

      await act(async () => {
        root.render(
          <StrictMode>
            <AuthContext.Provider
              value={{
                user: makeUser('CASHIER'),
                refresh: async () => {},
                logout: async () => {},
              }}
            >
              <Rates />
            </AuthContext.Provider>
          </StrictMode>,
        );
      });

      const cashierButton = Array.from(host.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Fetch latest rates'),
      );
      expect(cashierButton).toBeUndefined();
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });

  test('parseFenegosidaRates extracts fine gold and silver per-tola rates', () => {
    const parsed = parseFenegosidaRates([
      {
        rateType: 'तेजाबी सुन (१ तोला)',
        todayBaseRatePerGram: 240700,
        todayDate: '2026-11-25T04:57:44.7+00:00',
      },
      {
        rateType: 'छापावाल सुन (१० ग्राम)',
        todayBaseRatePerGram: 206960,
        todayDate: '2026-11-25T04:57:44.7+00:00',
      },
      {
        rateType: 'छापावाल सुन (१ तोला)',
        todayBaseRatePerGram: 241400,
        todayDate: '2026-11-25T04:57:44.7+00:00',
      },
      {
        rateType: 'असली चाँदी दर (१ तोला)',
        todayBaseRatePerGram: 3040,
        todayDate: '2026-11-25T04:57:44.7+00:00',
      },
    ]);
    expect(parsed).toEqual({
      goldPerTola: '241400.00',
      silverPerTola: '3040.00',
      sourceDate: '2026-11-25',
    });

    expect(() =>
      parseFenegosidaRates([
        { rateType: 'छापावाल सुन (१० ग्राम)', todayBaseRatePerGram: 206960 },
      ]),
    ).toThrow(/Missing gold or silver per-tola rate/);
  });
});
