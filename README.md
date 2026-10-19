# AwesomeJM

A SaaS application for Nepali gold and silver shops. The workspace contains a React/Vite frontend, a NestJS API, PostgreSQL inventory storage, shared public contracts and decimal weight-conversion utilities.

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
pnpm test:integration # Inventory API + real PostgreSQL; database must be running
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

## Scope and deployment

The health endpoint confirms application startup, not database readiness. This is a local, single-shop development module: authentication, staff attribution, authorization and production tenant isolation are still required before hosting customer data. Each stock query is scoped to a server-selected shop, but authenticated shop selection and PostgreSQL row-level security are not implemented. Keep the API on loopback while developing. Sales, custom orders, exchanges, suppliers, cost valuation, barcode printing, stocktaking and official billing remain future modules.

The conversion uses the first client's stated **11.664 grams per tola**, retained on every piece. Confirm that convention before importing business stock. The first receive form accepts grams; alternate unit entry and shop-specific conversion settings can follow. Physical stone/other weight is distinct from any future commercial wastage charge.

The Docker Compose credentials are for local development. Production needs separate credentials, TLS, access controls, backups with restore verification, and an explicit migration step.

Frontend and backend can be deployed separately. In production, configure the web host/reverse proxy to route `/api` to the backend; the Vite development proxy is not a production gateway. Build the API with `pnpm build`, then start it with `pnpm --filter @awesomejm/api start`. Production API environments must set an appropriate `HOST` and `PORT`.
