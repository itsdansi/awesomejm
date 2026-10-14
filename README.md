# AwesomeJM

A SaaS application for Nepali gold and silver shops. This initial workspace contains a React/Vite frontend, a NestJS API, shared public contracts and decimal weight-conversion utilities.

## Requirements

- Node.js **24.15.0**, pinned in `.node-version` and `.nvmrc`.
- pnpm **11.0.9**, pinned in `package.json`.

TypeScript is pinned to 6.0.3 to remain compatible with the current lint tooling. Dependency versions are centralised in the pnpm catalog and resolved in one lockfile.

## Start locally

Run from this Git repository root (the inner `awesomejm` directory):

```sh
fnm use
# Or: nvm use
pnpm install
pnpm dev
```

Defaults work without `.env` files. For local overrides:

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
pnpm format      # Format source and configuration
```

The smoke check uses ephemeral ports and stops its servers on completion. CI runs the same checks on Node 24.15.0 with frozen dependencies.

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

## Initial scope

The health endpoint confirms application startup, not database readiness. This scaffold does not yet include authentication, persistence, tenant isolation, inventory transactions or official billing. The starter conversion uses the first client's stated **11.664 grams per tola**. Confirm that convention before recording business transactions; retain the agreed factor in each transaction. The helpers return rounded display strings rather than an inventory ledger.

Frontend and backend can be deployed separately. In production, configure the web host/reverse proxy to route `/api` to the backend; the Vite development proxy is not a production gateway. Build the API with `pnpm build`, then start it with `pnpm --filter @awesomejm/api start`. Production API environments must set an appropriate `HOST` and `PORT`.
