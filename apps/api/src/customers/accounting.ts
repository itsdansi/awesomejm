import type pg from 'pg';
import { NotFoundException } from '@nestjs/common';
import { customerSchema, type Customer } from '@awesomejm/contracts';
import { SHOP_ID } from '../shop/shop.js';

export const customerColumns = `c.id, c.customer_code AS "customerCode", c.name, c.phone, c.address, c.pan, c.notes,
  c.opened_on::text AS "openedOn", c.version, COALESCE(b.balance_npr,0.00)::text AS "balanceNpr",
  COALESCE(b.latest_entry_date,c.opened_on)::text AS "latestEntryDate",
  to_char(c.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"`;
export const customerFrom = `customers c LEFT JOIN LATERAL (SELECT sum(amount_npr) AS balance_npr, max(entry_date) AS latest_entry_date FROM customer_account_entries WHERE shop_id = c.shop_id AND customer_id = c.id) b ON true`;
export const customerSnapshot = (customer: Customer) => ({
  customerCode: customer.customerCode,
  name: customer.name,
  phone: customer.phone,
  address: customer.address,
  pan: customer.pan,
});

export async function loadCustomer(
  client: pg.PoolClient,
  id: string,
  lock = false,
): Promise<Customer> {
  if (lock) {
    const result = await client.query(
      'SELECT id FROM customers WHERE shop_id=$1 AND id=$2 FOR UPDATE',
      [SHOP_ID, id],
    );
    if (!result.rowCount) throw new NotFoundException('Customer not found.');
  }
  const result = await client.query(
    `SELECT ${customerColumns} FROM ${customerFrom} WHERE c.shop_id=$1 AND c.id=$2`,
    [SHOP_ID, id],
  );
  if (!result.rowCount) throw new NotFoundException('Customer not found.');
  return customerSchema.parse(result.rows[0]);
}
