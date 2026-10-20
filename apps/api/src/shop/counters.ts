import type pg from 'pg';
import { SHOP_ID } from './shop.js';

export async function nextShopNumber(
  client: pg.PoolClient,
  scope: 'CUSTOMER' | 'ACCOUNT_ENTRY' | 'SALE' | 'ORDER',
) {
  const result = await client.query(
    `INSERT INTO shop_counters(shop_id,scope,last_number) VALUES($1,$2,1) ON CONFLICT(shop_id,scope) DO UPDATE SET last_number=shop_counters.last_number+1 RETURNING last_number::text AS number`,
    [SHOP_ID, scope],
  );
  const number: string = result.rows[0].number;
  return {
    number,
    code: `${scope === 'CUSTOMER' ? 'C' : scope === 'SALE' ? 'S' : scope === 'ORDER' ? 'O' : 'AC'}-${number.padStart(6, '0')}`,
  };
}
