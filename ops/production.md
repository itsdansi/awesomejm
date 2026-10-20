# Production access and recovery

This release supports **one shop in one dedicated database per deployment**. The API fixes the shop from `APP_SHOP_ID`; signed-in staff must belong to that shop, and request payloads cannot select another shop. It does not provide shared-database tenant switching or PostgreSQL row-level security. Use separate deployments/databases for additional clients until that architecture is implemented and tested.

## First owner and local use

Use Node 24.15+ (below 25) and the pinned pnpm version. From the repository root:

```sh
pnpm db:up
pnpm db:migrate
pnpm build
pnpm staff:owner
pnpm dev
```

`staff:owner` asks for a username, display name and hidden password (15–128 characters). It refuses to bootstrap while an active owner exists. No default credentials, public registration endpoint or authentication bypass is shipped. Credentials are never accepted through command-line arguments or environment variables. Run the command in your own interactive terminal, not a shared or recorded terminal. The web app now requires sign-in, including local development.

An owner can open **Staff & recovery**, create staff with temporary passwords, edit roles, disable access, reset passwords and sign out other devices. New and reset accounts must replace their temporary password before accessing shop records. Temporary passwords must be shared directly through a secure channel. Changing a role, name, active state or password revokes that staff member's sessions. Changing your own password signs you out everywhere.

If the owner loses their password, a trusted database operator can run `pnpm staff:reset` against the intended database. This sets a personal password through a hidden prompt, revokes all sessions and records an operator recovery event. It does not re-enable a disabled account. An existing owner must re-enable disabled staff. A new owner can be bootstrapped only when there is no active owner.

## Shop display settings

The avatar menu includes **Settings** for every staff member. Only owners can save the shop-wide calendar (AD or BS), timestamp timezone and 12/24-hour time. Settings are stored in `shops`, included in encrypted backups, and refresh on other open devices within 60 seconds or on focus. Date entry, CSV exports and Nepal accounting periods stay AD; BS changes display only. Monthly report rows retain their actual AD accounting boundaries, rendered as BS date ranges. BS dates outside the converter's supported 2000–2090 range fall back to labelled AD dates.

Apply migration `008_display_settings.sql` and reapply `ops/runtime-grants.sql` during upgrades: saving settings needs `UPDATE` access on `shops`. The migration keeps AD, Asia/Kathmandu and 24-hour defaults.

## Staff roles

| Capability                                                                   | Owner | Manager | Cashier | Viewer |
| ---------------------------------------------------------------------------- | ----- | ------- | ------- | ------ |
| Read shop records, accounts, dashboard, reports and exports                  | Yes   | Yes     | Yes     | Yes    |
| Create/edit customers, record incoming payments                              | Yes   | Yes     | Yes     | No     |
| Post sales, book/progress orders, record order advances                      | Yes   | Yes     | Yes     | No     |
| Receive jewellery, publish/revise rates, buy/exchange old metal              | Yes   | Yes     | No      | No     |
| Opening balances, advance refunds, order cancellation, corrections/reversals | Yes   | Yes     | No      | No     |
| Manage staff, revoke devices, view staff audit and backup status             | Yes   | No      | No      | No     |

All roles can see financial records and customer details. Do not assign Viewer or Cashier to someone who must not see those records. Permissions are checked on every API request, independently of hidden UI controls. No owner can remove their own owner access, and the last active owner is protected. Staff access changes also require a sign-in within the last 15 minutes; sign out and back in when prompted.

Passwords use salted scrypt (`N=131072, r=8, p=1`). Password hashing allows at most two concurrent operations per API process (budget at least 512 MB RAM for the API). Session cookies are opaque random 256-bit values; only their SHA256 hashes are stored. Production cookies use `__Host-`, `Secure`, `HttpOnly`, `SameSite=Strict` and root path. Sessions expire after 12 hours or 30 minutes without business requests. Passive session checks do not extend the idle timeout. There are no browser-local-storage credentials.

Mutations require JSON, the application request header, a session-bound CSRF token and an allowed Origin when supplied. The API has no cross-origin access enabled. Login has persistent 15-minute budgets (10 attempts per username, 50 per network address), including successful attempts, and generic credential errors. The API intentionally does not trust forwarded IP headers: behind one reverse proxy the network budget is shared across the shop. If changing proxy trust later, restrict it to the actual proxy addresses and retest rate limiting.

Business writes append audit rows within the same transaction, with staff ID and name snapshots, resource/record ID and changed-field names. Failed writes roll back their audit entries. Login/logout, resets and staff changes are also recorded. Passwords, session tokens and full business payloads are not copied into the audit trail. Older records and deliberate database-operator imports have no attributable staff member; they are shown as operator/legacy activity. Database-owner activity and DDL require infrastructure/database auditing if needed; this application trail cannot protect against an administrator who controls the database server.

## Hosting configuration

1. Provision a dedicated PostgreSQL 18 database. Keep its port private. Run migrations with separate operator credentials, and take/verify a backup before future upgrades.
2. Create a non-owner role `ajm_runtime` with `LOGIN`, `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOINHERIT`, `NOBYPASSRLS`. Set its password through PostgreSQL's interactive `\password` prompt. Run `ops/runtime-grants.sql` as the database owner. Reapply/review grants after migrations add tables. The API role must not own tables, run migrations or perform restores.
3. Set the API's private environment file to mode `0600`. Use a unique runtime database password. Do not deploy the Compose development credentials. Example values:

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=3001
APP_ORIGIN=https://jewellery.example.com
APP_SHOP_ID=00000000-0000-4000-8000-000000000001
DATABASE_URL=postgres://ajm_runtime:REPLACE_WITH_UNIQUE_SECRET@PRIVATE_DB_HOST:5432/awesomejm
```

Use database TLS with certificate verification if connecting over an untrusted network; configure the PostgreSQL client and CA trust for the hosting provider. Production startup requires `DATABASE_URL` and an exact HTTPS `APP_ORIGIN`. Node does not terminate browser TLS: serve the frontend and `/api` through one HTTPS origin. Keep the API on loopback or a private service network and expose only the reverse proxy. Do not enable wildcard CORS. `ops/nginx.conf.example` is a location/security-header example for an existing HTTPS server, not a certificate provisioner.

4. Build with `pnpm build`. Run `pnpm --filter @awesomejm/api start` under a restart supervisor; serve `apps/web/dist` through the HTTPS proxy. The Vite dev server is not the production host. Keep migration and recovery secrets out of the API process. The public `/api/v1/health` endpoint reports startup; verify an authenticated database read as part of deployment checks.
5. Bootstrap the owner using operator credentials and add individual staff accounts. Verify an unauthenticated request returns 401 and a Viewer cannot POST a sale. Verify sign-in/logout and printing over the actual HTTPS hostname.

No email recovery, MFA, SSO, shared-database tenancy or session-device inventory is included. Add them when the client needs them. Domain, certificates, hosting, alert delivery and off-site backup credentials must be supplied by the deployment operator.

## Encrypted backup and verification

Install PostgreSQL **18** client tools (`pg_dump`, `pg_restore`) on the backup host. Use read access to the application's complete schema and migration history. For the local Compose database only, set `PG_TOOLS=docker` to use the existing container's PostgreSQL tools. Production uses installed tools by default; URLs/passwords are passed in process environments rather than command arguments.

Keep a separate private operator environment (outside the repo) with `DATABASE_URL`, `RECOVERY_ADMIN_URL`, `BACKUP_KEY_FILE` and `BACKUP_DIR`. `RECOVERY_ADMIN_URL` must connect to a maintenance database on the recovery PostgreSQL server as a trusted operator able to create/drop temporary recovery databases. It may use a separate recovery server. It must never name a database that recovery tooling will drop. The recovery key must be readable only by its owner (`0600`); the API service does not need it. Generate it once:

```sh
pnpm db:backup-key /secure/awesomejm/primary.recovery-key
```

Store another copy of this key in a separate secure recovery location. Losing it makes the archives unrecoverable. Keep recovery/backup key material out of Git, application uploads and general logs. Environment example (not a shell command containing real secrets):

```dotenv
DATABASE_URL=postgres://BACKUP_OPERATOR:SECRET@PRIVATE_DB_HOST:5432/awesomejm
RECOVERY_ADMIN_URL=postgres://RECOVERY_OPERATOR:SECRET@RECOVERY_DB_HOST:5432/postgres
BACKUP_KEY_FILE=/secure/awesomejm/primary.recovery-key
BACKUP_DIR=/var/backups/awesomejm
```

Then run:

```sh
pnpm db:backup --verify
# Or perform the two steps separately:
pnpm db:backup
pnpm db:verify-backup /var/backups/awesomejm/ARCHIVE.ajmbak
```

A backup uses a PostgreSQL exported snapshot shared by `pg_dump` and the verification manifest. The manifest records exact row counts and SHA256 hashes of every table in `BACKUP_SCHEMA` (default `public`), with stable UTC/ISO representation. A custom-format dump is streamed directly into AES-256-GCM encryption; plaintext archives are never written locally. The envelope manifest is authenticated together with the dump. The final archive is renamed into place only after a successful dump. Interrupted files remain `.partial` and are never listed as successful backups. Sequence state is included by PostgreSQL's archive; restored audit sequence consistency is also checked. This is an application-schema backup; global database roles, certificates, environment files and any future external uploaded media need separate protection.

Verification authenticates the archive, creates a database named `ajm_verify_*`, restores with error-stop/single-transaction, checks every table's count and hash and validated constraints, and then revokes sessions in the restored copy. It removes only the temporary database created by that invocation. If the process is forcibly interrupted, an operator must inspect and remove any orphaned `ajm_verify_*` database after confirming that its verification process has stopped. It writes a private `.verify.json` evidence file beside the archive and records verification time in the source database's **Staff & recovery** screen. A successful verification of an old archive does not establish that today's data is backed up; check both creation and verification times.

Use the hosting scheduler to run **`pnpm db:backup --verify` daily**, with a non-overlapping job lock, an environment loader that reads the private operator environment, and alerting on a nonzero exit or missing daily success. Scheduling is intentionally host-managed; no scheduler is silently installed by the app. Copy the encrypted archive and evidence off the application host after verification. Set a retention policy with the client; an initial policy is 14 daily and 8 weekly verified copies, with at least one copy protected from deletion by the application host. Test that the off-site copy and separately stored key can be retrieved. Confirm the acceptable data-loss window: daily backups can lose up to a day; use managed PostgreSQL point-in-time recovery if that is unacceptable.

Backup commands do not automatically delete old archives or upload data. Configure retention, off-site storage, monitoring and alert recipients on the hosting platform. Do not consider rollout complete until a real production backup has been verified and an off-site retrieval drill succeeds.

## Incident restore runbook

1. Stop application writes and record the incident time. Preserve the failed database and logs. Select a verified archive, retrieve its key separately and verify the encrypted file's SHA256 against the saved evidence. Do not overwrite the original archive.
2. With the private operator environment loaded, run:

```sh
pnpm db:restore /recovery/ARCHIVE.ajmbak ajm_recovered_20261020
```

Only a **new** database name beginning `ajm_recovered_` is accepted. Existing databases are never overwritten, cleared or dropped. A failed restore removes only the new database created by that invocation. The command verifies the archive contents and constraints, revokes all restored sessions and login attempt limits, and writes a `.restore.json` evidence file. The recovered database's owner is the recovery operator; reapply runtime grants in that new database.

3. Start a private application instance pointing to the recovered database, with the same shop ID. Sign in afresh. Compare the dashboard, customer dues/advances, stock weights and latest purchase/sale/order records with the client's last known closing figures and backup timestamp. For an older release, run the matching app version first, then take a new backup before applying later migrations.
4. Update the normal API's `DATABASE_URL` to the recovered database and restart it. Confirm unauthorized access is rejected and permitted shop operations work. Reopen writes after the owner verifies the recovery point. Record any transactions that must be re-entered from paper records; do not replay payment webhooks blindly.
5. Take and verify a new backup, restore off-site copying, and document measured recovery time/data loss. Keep the old database until the owner approves its eventual disposal.

`pnpm test:integration` includes a disposable-database drill: backup, real restore verification, corrupt archive/wrong-key rejection, destination protection, session invalidation and a fresh sign-in to recovered inventory. This proves the implementation locally, not the accessibility of your production host or off-site credentials.

References: [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html), [PostgreSQL 18 pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html), [pg_restore](https://www.postgresql.org/docs/18/app-pgrestore.html).
