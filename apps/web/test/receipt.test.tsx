import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ReceiveForm } from '../src/inventory/ReceiveForm';
import { getLanguage, setLanguage } from '../src/i18n/language';

const api = vi.hoisted(() => ({
  request:
    vi.fn<
      (path: string, schema: unknown, init?: RequestInit) => Promise<unknown>
    >(),
}));
vi.mock('../src/inventory/api', () => ({
  request: api.request,
  errorMessage: (error: Error) => error.message,
}));
vi.mock('../src/inventory/ui', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <>{children}</>,
  Icon: () => null,
}));

let host: HTMLDivElement, root: Root;
let previousLanguage: ReturnType<typeof getLanguage>;
const saved = vi.fn();
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  previousLanguage = getLanguage();
  setLanguage('en');
  api.request.mockReset().mockResolvedValue(undefined);
  saved.mockReset();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(<ReceiveForm onClose={() => {}} onSaved={saved} />),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  setLanguage(previousLanguage);
  vi.unstubAllGlobals();
});

function field(labelText: string) {
  const label = [...host.querySelectorAll('label')].find(
    (label) => label.firstChild?.textContent?.trim() === labelText,
  );
  const input = label?.querySelector('input');
  if (!input) throw new Error(`Missing field: ${labelText}`);
  return input;
}
async function enter(input: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )!.set!;
    setter.call(input, value);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}
async function fillReceipt() {
  await enter(field('Item code'), 'STONE-001');
  await enter(field('Item name'), 'Stone ring');
  await enter(field('Category'), 'Ring');
  await enter(
    host.querySelector<HTMLInputElement>(
      '[aria-label="Gross weight — grams"]',
    )!,
    '12.664',
  );
  await enter(
    host.querySelector<HTMLInputElement>(
      '[aria-label="Net metal weight — grams"]',
    )!,
    '11.664',
  );
  await enter(field('Component name (optional)'), 'Pote');
  await enter(field('Pote (NPR)'), '400');
}
async function submit() {
  await act(async () => {
    host
      .querySelector('form')!
      .dispatchEvent(
        new window.Event('submit', { bubbles: true, cancelable: true }),
      );
  });
}

test('receipt posts a rupee amount independently of gross and net weights', async () => {
  await fillReceipt();
  expect(field('Pote (NPR)').parentElement?.querySelector('select')).toBeNull();
  expect(
    host.querySelector('[aria-label="Stone / other weight — grams"]'),
  ).toBeNull();
  await submit();
  expect(api.request).toHaveBeenCalledTimes(1);
  const body = JSON.parse(String(api.request.mock.calls[0]?.[2]?.body));
  expect(body).toMatchObject({
    grossWeightGrams: '12.664',
    nonMetalWeightGrams: '1.000',
    nonMetalValueNpr: '400',
    nonMetalLabel: 'Pote',
  });
  expect(body).not.toHaveProperty('netWeightGrams');
  expect(saved).toHaveBeenCalledOnce();
});

test('receipt rejects net weight above gross weight without posting', async () => {
  await fillReceipt();
  await enter(
    host.querySelector<HTMLInputElement>(
      '[aria-label="Net metal weight — grams"]',
    )!,
    '13',
  );
  await submit();
  expect(api.request).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    'no greater than gross weight',
  );
});

test('receipt rejects money with more than two decimal places', async () => {
  await fillReceipt();
  await enter(field('Pote (NPR)'), '400.001');
  await submit();
  expect(api.request).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
});

test('component names preserve Nepali text in the label and saved receipt', async () => {
  await fillReceipt();
  await enter(field('Component name (optional)'), 'पोते');
  expect(field('पोते (NPR)').value).toBe('400');
  await submit();
  const body = JSON.parse(String(api.request.mock.calls[0]?.[2]?.body));
  expect(body.nonMetalLabel).toBe('पोते');
});

test('clearing the component name restores the generic amount label', async () => {
  await fillReceipt();
  await enter(field('Component name (optional)'), '');
  expect(field('Stone / other value (NPR)').value).toBe('400');
  await submit();
  const body = JSON.parse(String(api.request.mock.calls[0]?.[2]?.body));
  expect(body.nonMetalLabel).toBe('');
});
