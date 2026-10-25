import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveRoute } from '../src/shared/routes.ts';

test('menu routes select the correct persistent shell section', () => {
  for (const [path, section] of Object.entries({
    dashboard: 'Dashboard',
    inventory: 'Inventory',
    rates: 'Metal rates',
    customers: 'Customers',
    sales: 'Sales',
    orders: 'Orders',
    purchases: 'Purchases',
    reports: 'Reports',
    account: 'Account',
    settings: 'Settings',
    staff: 'Staff & recovery',
  })) {
    assert.equal(resolveRoute(`#/${path}`, ['staff.manage']).section, section);
  }
  assert.equal(resolveRoute('', []).section, 'Dashboard');
  assert.equal(resolveRoute('#/unknown', []).section, 'Dashboard');
});

test('detail routes and delivery links preserve record IDs and order queries', () => {
  for (const [path, section] of Object.entries({
    customers: 'Customers',
    orders: 'Orders',
    sales: 'Sales',
    purchases: 'Purchases',
  })) {
    const route = resolveRoute(`#/${path}/record-123?orderId=order-456`, []);
    assert.equal(route.section, section);
    assert.equal(route.recordId, 'record-123');
    if (path === 'sales' || path === 'purchases')
      assert.equal(route.orderId, 'order-456');
  }
});

test('restricted routes show the account section and retain creation permissions', () => {
  assert.equal(resolveRoute('#/staff', []).section, 'Account');
  for (const [path, section] of Object.entries({
    sales: 'Sales',
    orders: 'Orders',
    purchases: 'Purchases',
  })) {
    assert.equal(
      resolveRoute(`#/${path}/new?orderId=123`, []).section,
      'Account',
    );
    assert.equal(
      resolveRoute(`#/${path}/new?orderId=123`, [`${path}.write`]).section,
      section,
    );
    assert.equal(resolveRoute(`#/${path}`, []).section, section);
  }
});
