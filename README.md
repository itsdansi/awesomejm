# AwesomeJM

A SaaS application for Nepali gold and silver shops. The workspace contains a React/Vite frontend, a NestJS API, PostgreSQL inventory, metal-rate and customer-account storage, shared public contracts and decimal calculation utilities.

## Requirements

- Node.js **24.15.0**, pinned in `.node-version` and `.nvmrc`.
- pnpm **11.0.9**, pinned in `package.json`.
- Docker Desktop (running) for the local PostgreSQL 18 database.

TypeScript is pinned to 6.0.3 to remain compatible with the current lint tooling. Dependency versions are centralised in the pnpm catalog and resolved in one lockfile.

## Start locally

Run from this Git repository root (the inner `awesomejm` directory):

```sh
fnm use
# Or: nvm use
pnpm install
pnpm db:up
pnpm db:migrate
pnpm dev
```

Local development defaults work without `.env` files. The database listens only on `127.0.0.1:5433`, with data retained in the `awesomejm_inventory_db` Docker volume. `pnpm db:stop` stops the database without removing its data. For local overrides:

```sh
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

- Frontend: http://127.0.0.1:5173
- API health: http://127.0.0.1:3001/api/v1/health

The frontend proxies `/api` to the API during development. If the API port changes, update the frontend's `API_PROXY_TARGET`. Shared packages compile before the applications start and run their own compiler watchers.

## Checks

```sh
pnpm check       # Lint, type checks, calculation tests, builds, formatting
pnpm smoke       # Start temporary API/web servers and verify their connection
pnpm test:integration # Inventory/rates/customer APIs + real PostgreSQL; database must be running
pnpm format      # Format source and configuration
```

The smoke check uses ephemeral ports and stops its servers on completion. Integration tests create and remove a unique temporary schema, leaving development stock untouched. Set `TEST_DATABASE_URL` to use a different test database; the test role needs schema creation permission. CI runs these checks against PostgreSQL on Node 24.15.0 with frozen dependencies.

## Workspace

```text
apps/
  api/                 NestJS API and server-only business modules
  web/                 React/Vite frontend
packages/
  contracts/           Public API schemas and inferred TypeScript types
  calculations/        Pure decimal calculations usable by web and API
  tooling/             Shared TypeScript and ESLint configuration
scripts/               Runtime and integration checks
```

Shared packages expose compiled ESM and type declarations through explicit package exports. Workspace dependencies are declared with `workspace:*`. Application packages stay at the ends of the dependency graph.

Keep database access, credentials, authorisation and authoritative transaction posting in the API. The browser can use shared calculations for previews; the API must validate final business values. Domain modules such as inventory, sales, orders, exchanges and accounts should start inside `apps/api/src` and only become packages when another application needs them.

## Inventory module

- Receive individual gold/silver pieces with a unique item code, name, category, fineness, gross weight, stone/other weight and notes.
- Stock is stored in exact decimal grams (3 decimal places). PostgreSQL derives net metal weight and fine-metal equivalent (6 decimal places). Fineness is parts per thousand; 22K is approximately 916.667‰, while the entered value should reflect the actual piece.
- Display net grams and tola, with separate available gold/silver totals. Fine-metal equivalent is visible in piece details.
- Search code, name and category; filter by metal or available/voided state; paginate results.
- Correct a mistaken receipt by voiding it with a reason. The piece and its negative reversal remain in history, and its code cannot be reused. This correction is not a sale, return, exchange or physical stock write-off.
- Item receipt and movement posting are one database transaction. Row locking prevents duplicate corrections, database constraints prevent duplicate item codes, and movement updates/deletions are blocked by a database trigger.

API routes under `/api/v1/inventory`:

| Method | Route                                                           | Purpose                                            |
| ------ | --------------------------------------------------------------- | -------------------------------------------------- |
| GET    | `/items?search=&metal=GOLD&status=AVAILABLE&page=1&pageSize=20` | Filtered, paginated stock                          |
| POST   | `/items`                                                        | Receive one piece                                  |
| GET    | `/summary`                                                      | Available totals by metal                          |
| GET    | `/items/:id/history`                                            | Receipt and correction history                     |
| POST   | `/items/:id/void`                                               | Void a mistaken receipt with `{ "reason": "..." }` |

Run `pnpm db:migrate` after pulling new migrations. Applied migrations are tracked and serialized using a PostgreSQL advisory lock. Database changes are explicit rather than applied when the API starts. Migration source lives in `apps/api/migrations`; do not edit already-applied migrations.

## Metal rates module

Open **Metal rates** in the sidebar (`/#/rates`); inventory remains at `/#/inventory`.

- Record manual buying and selling quotes in NPR per tola for a metal, actual fineness and AD date. Nepal's timezone determines today's date. No live market-feed integration is included.
- Select a date to see its latest quote for each metal/purity. A missing rate stays empty; yesterday's rate is not carried forward automatically.
- Save revisions with a reason, preserving the original amounts, source, timestamp, conversion and revision number. The rate date, metal and purity identify a series; revisions cannot change those fields.
- Filter all history by date range and metal, with pagination. Both initial rates and later revisions remain visible.
- Money uses exact decimal strings and PostgreSQL `numeric(11,2)`. Each quote retains the shop's 11.664 g/tola conversion. Per-gram values are rounded display previews; future sales must calculate from the original per-tola rate and retain a rate snapshot.
- A quoted rate already applies to its stated purity. It must not receive a second purity adjustment. Buying and selling quotes are entered independently; no fixed margin is imposed.
- Publishing uses a transaction, a lock on the normalized date/metal/purity key, and an expected revision. Concurrent submissions return a conflict rather than silently replacing another quote. Database triggers block rate updates/deletions.

| Method | Route under `/api/v1/rates`                                                             | Purpose                                       |
| ------ | --------------------------------------------------------------------------------------- | --------------------------------------------- |
| GET    | `?date=2026-01-15&metal=GOLD`                                                           | Latest quotes on exactly that date            |
| POST   | `/`                                                                                     | Publish an initial quote or append a revision |
| GET    | `/history?from=2026-01-01&to=2026-01-31&metal=GOLD&fineness=916.667&page=1&pageSize=20` | Filtered revision history                     |

Publish fields: `rateDate`, `metal`, `fineness`, `buyRatePerTola`, `sellRatePerTola`, `source`, `reason`, `expectedRevision`. Use decimal strings for amounts and fineness. Set `expectedRevision` to `0` for a new series or the latest revision number for an update; updates require a reason of at least five characters. Future dates are rejected. Rates do not automatically revalue stock or change past transactions.

## Customer accounts module

Open **Customers** in the sidebar (`/#/customers`). A customer has a generated shop-scoped code, name, optional phone/address/PAN/notes, and an account opened on an AD date. Unicode names are supported. Phone punctuation is normalized, shared phone numbers are allowed, and an optional PAN accepts nine digits according to the [IRD FAQ](https://ird.gov.np/faq/). PAN format validation does not verify registration with IRD.

- Create an account as settled, with opening dues, or with an opening advance. A nonzero opening balance requires a source reference. The customer, profile history, account entry and numbering are committed in one transaction.
- Search name, phone, PAN or customer code; filter accounts by dues, advance or settled state. Summary totals show dues and advances separately rather than netting unrelated customer balances.
- Record money received by cash, bank or digital wallet. Payments reduce dues; overpayment becomes an advance. Record an advance already returned to the customer using the refund action. This records completed money movements; no payment-provider integration is present.
- Refunds cannot exceed the advance held. Entries must be on or after the opening date and the most recent entry date, and cannot be future-dated. The first version therefore posts in date order; choose the correct opening date before entering historical records.
- All NPR amounts use decimal strings and PostgreSQL `numeric(11,2)`. A positive account balance means the customer owes the shop; a negative balance means an advance is held. A statement shows chronological running balances, newest entries first, and date-range opening/closing balances calculated across the full ledger before pagination.
- Correct an entry with an equal and opposite reversal and a reason. The original remains visible and marked reversed. A reversal corrects a recording mistake; actual money returned belongs in an advance refund. An entry can be reversed only once, and reversals cannot themselves be reversed.
- Customer creation, payments, refunds and reversals require a UUID `requestId`. Retrying the same normalized payload/key returns the saved record without repeating its financial effect. Reusing a key for different content returns a conflict. Keep the key when retrying an uncertain network response; use a fresh key for a genuinely new transaction.
- Financial writes lock the customer row to serialize balance checks. Profile edits preserve omitted fields and use an expected version and reason, preserving an append-only audit history (the latest 20 changes are displayed). Posted account entries retain a snapshot of the customer details for acknowledgement printing.
- View an entry to print an internal payment/refund acknowledgement. These records are not sales invoices or IRD-approved billing. Statements and account entries are not a complete double-entry general ledger or bank reconciliation.

| Method | Route under `/api/v1/customers`                                | Purpose                                          |
| ------ | -------------------------------------------------------------- | ------------------------------------------------ |
| GET    | `?search=&balance=ALL&page=1&pageSize=20`                      | Search/filter customer balances                  |
| GET    | `/summary`                                                     | Customer count, dues and advances                |
| POST   | `/`                                                            | Create customer and optional opening balance     |
| GET    | `/:id`                                                         | Customer and recent profile history              |
| PATCH  | `/:id`                                                         | Edit profile with `expectedVersion` and `reason` |
| GET    | `/:id/ledger?from=2026-01-01&to=2026-01-31&page=1&pageSize=20` | Account statement                                |
| POST   | `/:id/payments`                                                | Record `PAYMENT` or `ADVANCE_REFUND`             |
| POST   | `/:id/entries/:entryId/reverse`                                | Append a reversal with a reason                  |

There is no general manual-charge endpoint. Sales, orders and exchanges will add their own linked postings and transaction snapshots in future modules. Posted financial history has no update or delete API.

## Scope and deployment

The health endpoint confirms application startup, not database readiness. These are local, single-shop development modules: authentication, staff attribution, authorization and production tenant isolation are still required before hosting customer data. Inventory, rates and customer queries are scoped to a server-selected shop, but authenticated shop selection and PostgreSQL row-level security are not implemented. Keep the API on loopback while developing. Sales, custom orders, exchanges, suppliers, cost valuation, barcode printing, stocktaking and official billing remain future modules.

The conversion uses the first client's stated **11.664 grams per tola**, retained on every piece. Confirm that convention before importing business stock. The first receive form accepts grams; alternate unit entry and shop-specific conversion settings can follow. Physical stone/other weight is distinct from any future commercial wastage charge.

The Docker Compose credentials are for local development. Production needs separate credentials, TLS, access controls, backups with restore verification, and an explicit migration step.

Frontend and backend can be deployed separately. In production, configure the web host/reverse proxy to route `/api` to the backend; the Vite development proxy is not a production gateway. Build the API with `pnpm build`, then start it with `pnpm --filter @awesomejm/api start`. Production API environments must set an appropriate `HOST` and `PORT`.
