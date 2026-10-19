import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type pg from 'pg';
import {
  accountMutationSchema,
  customerDetailSchema,
  customerListSchema,
  customerProfileSchema,
  customerSchema,
  customerStatementSchema,
  customerSummarySchema,
  type AccountPayment,
  type CreateCustomer,
  type Customer,
  type CustomerQuery,
  type LedgerQuery,
  type ReverseAccountEntry,
  type UpdateCustomer,
} from '@awesomejm/contracts';
import { DatabaseService } from '../database/database.service.js';
import { SHOP_ID } from '../shop/shop.js';

const customerColumns = `c.id, c.customer_code AS "customerCode", c.name, c.phone, c.address, c.pan, c.notes,
  c.opened_on::text AS "openedOn", c.version, COALESCE(b.balance_npr,0.00)::text AS "balanceNpr",
  COALESCE(b.latest_entry_date,c.opened_on)::text AS "latestEntryDate",
  to_char(c.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"`;
const customerFrom = `customers c LEFT JOIN LATERAL (SELECT sum(amount_npr) AS balance_npr, max(entry_date) AS latest_entry_date FROM customer_account_entries WHERE shop_id = c.shop_id AND customer_id = c.id) b ON true`;
const fingerprint = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const snapshot = (customer: Customer) => ({
  customerCode: customer.customerCode,
  name: customer.name,
  phone: customer.phone,
  address: customer.address,
  pan: customer.pan,
});

@Injectable()
export class CustomersService {
  constructor(private readonly database: DatabaseService) {}

  private async customer(
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

  private async nextNumber(
    client: pg.PoolClient,
    scope: 'CUSTOMER' | 'ACCOUNT_ENTRY',
  ) {
    const result = await client.query(
      `INSERT INTO shop_counters(shop_id,scope,last_number) VALUES($1,$2,1) ON CONFLICT(shop_id,scope) DO UPDATE SET last_number=shop_counters.last_number+1 RETURNING last_number::text AS number`,
      [SHOP_ID, scope],
    );
    const number: string = result.rows[0].number;
    return {
      number,
      code: `${scope === 'CUSTOMER' ? 'C' : 'AC'}-${number.padStart(6, '0')}`,
    };
  }

  async list(query: CustomerQuery) {
    return this.database.run(async (client) => {
      const search = `%${query.search.replace(/[\\%_]/g, '\\$&')}%`;
      const where = `c.shop_id=$1 AND (c.name ILIKE $2 OR c.customer_code ILIKE $2 OR c.phone ILIKE $2 OR c.pan ILIKE $2) AND ($3='ALL' OR ($3='DUE' AND COALESCE(b.balance_npr,0)>0) OR ($3='ADVANCE' AND COALESCE(b.balance_npr,0)<0) OR ($3='SETTLED' AND COALESCE(b.balance_npr,0)=0))`;
      const values = [SHOP_ID, search, query.balance];
      const result = await client.query(
        `SELECT ${customerColumns}, count(*) OVER()::int AS "totalCount" FROM ${customerFrom} WHERE ${where} ORDER BY c.name,c.id LIMIT $4 OFFSET $5`,
        [...values, query.pageSize, (query.page - 1) * query.pageSize],
      );
      const total = result.rows.length
        ? result.rows[0].totalCount
        : (
            await client.query(
              `SELECT count(*)::int AS count FROM ${customerFrom} WHERE ${where}`,
              values,
            )
          ).rows[0].count;
      return customerListSchema.parse({
        items: result.rows,
        total,
        page: query.page,
        pageSize: query.pageSize,
      });
    });
  }

  async summary() {
    return this.database.run(async (client) => {
      const result = await client.query(
        `SELECT count(*)::int AS customers, COALESCE(sum(GREATEST(COALESCE(b.balance_npr,0),0)),0.00)::text AS "receivableNpr", COALESCE(sum(GREATEST(-COALESCE(b.balance_npr,0),0)),0.00)::text AS "advanceNpr" FROM ${customerFrom} WHERE c.shop_id=$1`,
        [SHOP_ID],
      );
      return customerSummarySchema.parse(result.rows[0]);
    });
  }

  async detail(id: string) {
    return this.database.run(async (client) => {
      await client.query(
        'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
      );
      const customer = await this.customer(client, id);
      const history = await client.query(
        `SELECT version, profile->>'name' AS name, profile->>'phone' AS phone, profile->>'address' AS address, profile->>'pan' AS pan, profile->>'notes' AS notes, reason, to_char(changed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "changedAt" FROM customer_profile_history WHERE shop_id=$1 AND customer_id=$2 ORDER BY version DESC LIMIT 20`,
        [SHOP_ID, id],
      );
      return customerDetailSchema.parse({
        customer,
        profileHistory: history.rows,
      });
    }, true);
  }

  async create(input: CreateCustomer) {
    return this.database.run(async (client) => {
      const hash = fingerprint(input);
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`customer-create:${SHOP_ID}:${input.requestId}`],
      );
      const existing = await client.query(
        'SELECT id,request_fingerprint FROM customers WHERE shop_id=$1 AND create_request_id=$2',
        [SHOP_ID, input.requestId],
      );
      if (existing.rowCount) {
        if (existing.rows[0].request_fingerprint !== hash)
          throw new ConflictException(
            'This request was already saved with different customer details. Refresh before creating another customer.',
          );
        return this.customer(client, existing.rows[0].id);
      }
      const id = randomUUID();
      const code = await this.nextNumber(client, 'CUSTOMER');
      await client.query(
        `INSERT INTO customers(id,shop_id,customer_code,name,phone,address,pan,notes,opened_on,create_request_id,request_fingerprint) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          id,
          SHOP_ID,
          code.code,
          input.name,
          input.phone,
          input.address,
          input.pan,
          input.notes,
          input.openedOn,
          input.requestId,
          hash,
        ],
      );
      await client.query(
        'INSERT INTO customer_profile_history(shop_id,customer_id,version,profile,reason) VALUES($1,$2,1,$3,$4)',
        [
          SHOP_ID,
          id,
          JSON.stringify(customerProfileSchema.parse(input)),
          'Customer created',
        ],
      );
      if (input.openingType !== 'NONE') {
        const customer = await this.customer(client, id);
        const entry = await this.nextNumber(client, 'ACCOUNT_ENTRY');
        await client.query(
          `INSERT INTO customer_account_entries(id,shop_id,customer_id,entry_number,entry_code,entry_date,kind,amount_npr,reference,notes,customer_snapshot,request_id,request_fingerprint) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            randomUUID(),
            SHOP_ID,
            id,
            entry.number,
            entry.code,
            input.openedOn,
            input.openingType === 'DUE' ? 'OPENING_DUE' : 'OPENING_ADVANCE',
            `${input.openingType === 'ADVANCE' ? '-' : ''}${input.openingAmountNpr}`,
            input.openingReference,
            'Opening balance brought forward',
            JSON.stringify(snapshot(customer)),
            input.requestId,
            hash,
          ],
        );
      }
      return this.customer(client, id);
    }, true);
  }

  async update(id: string, input: UpdateCustomer) {
    return this.database.run(async (client) => {
      const customer = await this.customer(client, id, true);
      if (customer.version !== input.expectedVersion)
        throw new ConflictException(
          'The customer profile has changed. Close this form and refresh before editing.',
        );
      const profile = customerProfileSchema.parse({ ...customer, ...input });
      await client.query(
        'UPDATE customers SET name=$3,phone=$4,address=$5,pan=$6,notes=$7,version=version+1 WHERE shop_id=$1 AND id=$2',
        [
          SHOP_ID,
          id,
          profile.name,
          profile.phone,
          profile.address,
          profile.pan,
          profile.notes,
        ],
      );
      await client.query(
        'INSERT INTO customer_profile_history(shop_id,customer_id,version,profile,reason) VALUES($1,$2,$3,$4,$5)',
        [
          SHOP_ID,
          id,
          customer.version + 1,
          JSON.stringify(profile),
          input.reason,
        ],
      );
      return this.customer(client, id);
    }, true);
  }

  private async replay(
    client: pg.PoolClient,
    customer: Customer,
    requestId: string,
    hash: string,
  ) {
    const existing = await client.query(
      'SELECT id,request_fingerprint,customer_id FROM customer_account_entries WHERE shop_id=$1 AND request_id=$2',
      [SHOP_ID, requestId],
    );
    if (!existing.rowCount) return null;
    if (
      existing.rows[0].request_fingerprint !== hash ||
      existing.rows[0].customer_id !== customer.id
    )
      throw new ConflictException(
        'This request was already used for a different account entry. Refresh before recording another payment.',
      );
    return accountMutationSchema.parse({
      entryId: existing.rows[0].id,
      customer,
    });
  }

  async post(id: string, input: AccountPayment) {
    return this.database.run(async (client) => {
      const customer = await this.customer(client, id, true);
      const hash = fingerprint([id, input]);
      const replay = await this.replay(client, customer, input.requestId, hash);
      if (replay) return replay;
      if (input.entryDate < customer.latestEntryDate)
        throw new BadRequestException(
          `Choose a date on or after ${customer.latestEntryDate}. Entries are posted in date order.`,
        );
      if (input.kind === 'ADVANCE_REFUND') {
        const result = await client.query(
          'SELECT $1::numeric < 0 AND $2::numeric <= -$1::numeric AS allowed',
          [customer.balanceNpr, input.amountNpr],
        );
        if (!result.rows[0].allowed)
          throw new BadRequestException(
            'Refund cannot exceed the advance currently held for this customer.',
          );
      }
      const entry = await this.nextNumber(client, 'ACCOUNT_ENTRY');
      const entryId = randomUUID();
      await client.query(
        `INSERT INTO customer_account_entries(id,shop_id,customer_id,entry_number,entry_code,entry_date,kind,amount_npr,method,reference,notes,customer_snapshot,request_id,request_fingerprint) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          entryId,
          SHOP_ID,
          id,
          entry.number,
          entry.code,
          input.entryDate,
          input.kind,
          `${input.kind === 'PAYMENT' ? '-' : ''}${input.amountNpr}`,
          input.method,
          input.reference,
          input.notes,
          JSON.stringify(snapshot(customer)),
          input.requestId,
          hash,
        ],
      );
      return accountMutationSchema.parse({
        entryId,
        customer: await this.customer(client, id),
      });
    }, true);
  }

  async reverse(id: string, entryId: string, input: ReverseAccountEntry) {
    return this.database.run(async (client) => {
      const customer = await this.customer(client, id, true);
      const hash = fingerprint([id, entryId, input]);
      const replay = await this.replay(client, customer, input.requestId, hash);
      if (replay) return replay;
      const result = await client.query(
        'SELECT kind,amount_npr::text,entry_code FROM customer_account_entries WHERE shop_id=$1 AND customer_id=$2 AND id=$3',
        [SHOP_ID, id, entryId],
      );
      if (!result.rowCount)
        throw new NotFoundException('Account entry not found.');
      if (result.rows[0].kind === 'REVERSAL')
        throw new BadRequestException(
          'A reversal cannot itself be reversed. Record the correct payment as a new entry.',
        );
      if (input.entryDate < customer.latestEntryDate)
        throw new BadRequestException(
          `Choose a reversal date on or after ${customer.latestEntryDate}.`,
        );
      const reversed = await client.query(
        'SELECT 1 FROM customer_account_entries WHERE shop_id=$1 AND reversal_of=$2',
        [SHOP_ID, entryId],
      );
      if (reversed.rowCount)
        throw new ConflictException('This entry has already been reversed.');
      const entry = await this.nextNumber(client, 'ACCOUNT_ENTRY');
      const reversalId = randomUUID();
      await client.query(
        `INSERT INTO customer_account_entries(id,shop_id,customer_id,entry_number,entry_code,entry_date,kind,amount_npr,reference,notes,reversal_of,customer_snapshot,request_id,request_fingerprint) VALUES($1,$2,$3,$4,$5,$6,'REVERSAL',-$7::numeric,$8,$9,$10,$11,$12,$13)`,
        [
          reversalId,
          SHOP_ID,
          id,
          entry.number,
          entry.code,
          input.entryDate,
          result.rows[0].amount_npr,
          result.rows[0].entry_code,
          input.reason,
          entryId,
          JSON.stringify(snapshot(customer)),
          input.requestId,
          hash,
        ],
      );
      return accountMutationSchema.parse({
        entryId: reversalId,
        customer: await this.customer(client, id),
      });
    }, true);
  }

  async statement(id: string, query: LedgerQuery) {
    return this.database.run(async (client) => {
      await client.query(
        'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
      );
      const customer = await this.customer(client, id);
      const result = await client.query(
        `WITH ledger AS (SELECT *, sum(amount_npr) OVER(ORDER BY entry_date,entry_number ROWS UNBOUNDED PRECEDING) AS running_balance FROM customer_account_entries WHERE shop_id=$1 AND customer_id=$2)
        SELECT e.id,e.entry_code AS "entryCode",e.entry_date::text AS "entryDate",e.kind,e.amount_npr::text AS "amountNpr",e.method,e.reference,e.notes,e.reversal_of AS "reversalOf",e.customer_snapshot AS "customerSnapshot",e.running_balance::text AS "runningBalanceNpr",
        EXISTS(SELECT 1 FROM customer_account_entries r WHERE r.shop_id=e.shop_id AND r.reversal_of=e.id) AS reversed,
        to_char(e.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
        FROM ledger e WHERE ($3::date IS NULL OR e.entry_date >= $3) AND ($4::date IS NULL OR e.entry_date <= $4) ORDER BY e.entry_date DESC,e.entry_number DESC LIMIT $5 OFFSET $6`,
        [
          SHOP_ID,
          id,
          query.from ?? null,
          query.to ?? null,
          query.pageSize,
          (query.page - 1) * query.pageSize,
        ],
      );
      const totals = await client.query(
        `SELECT count(*) FILTER(WHERE ($3::date IS NULL OR entry_date >= $3) AND ($4::date IS NULL OR entry_date <= $4))::int AS total, COALESCE(sum(amount_npr) FILTER(WHERE $3::date IS NOT NULL AND entry_date < $3),0.00)::text AS "openingBalanceNpr", COALESCE(sum(amount_npr) FILTER(WHERE $4::date IS NULL OR entry_date <= $4),0.00)::text AS "closingBalanceNpr" FROM customer_account_entries WHERE shop_id=$1 AND customer_id=$2`,
        [SHOP_ID, id, query.from ?? null, query.to ?? null],
      );
      return customerStatementSchema.parse({
        customer,
        items: result.rows,
        ...totals.rows[0],
        page: query.page,
        pageSize: query.pageSize,
      });
    }, true);
  }
}
