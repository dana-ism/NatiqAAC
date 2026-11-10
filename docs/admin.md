# Admin Portal V1

The dedicated [Admin frontend experience](admin-frontend-experience.md) extends
this baseline with a shared review workspace and an exact pending-count endpoint.
Its delivery report distinguishes implementation from external setup and tests.

This document describes the V1 baseline. Account Management V2 extends it with
specialist applications, transactional decisions/audit and private document review;
see [V2 implementation and migration guide](auth-account-management-v2.md).
The following V1 statements about no schema/dependency changes refer to V1 only.

## Scope and architecture

Implemented: ADMIN authorization, a manual first-Admin command, `/admin/overview`,
and a bilingual responsive React workspace at `/admin`. All Admin accounts share
the existing ADMIN role. No new ORM, service, dependency, schema or migration is
introduced. Flutter and FastAPI boundaries are unchanged.

`AdminModule` is part of the Nest modular monolith and imports the existing
`AuthModule`. Its controller applies `JwtAuthGuard` followed by `RolesGuard` and
`@Roles('ADMIN')` at controller level. Future Admin controllers must use the same
three declarations and receive authorization tests. RolesGuard denies access
when role metadata or authenticated identity is missing.

JWT signature/expiry and UUID validation remain in the existing strategy. Each
protected request fetches the current user from PostgreSQL. Missing/deleted,
PENDING or SUSPENDED identities receive 401; a current PARENT or SPECIALIST
receives 403 even if its old JWT claims ADMIN. Database/service errors propagate
through existing Nest handling; the role guard does not disguise them as 403.
Public registration still rejects extra fields and always creates PARENT/ACTIVE.

## API

| Endpoint            | Authentication                     | Success                                                                 |
| ------------------- | ---------------------------------- | ----------------------------------------------------------------------- |
| GET /admin/overview | Valid JWT and current ACTIVE ADMIN | 200: `{ "account": { "email": "admin@example.com", "role": "ADMIN" } }` |

The overview provides the verified account for the initial workspace. It returns
no UUID, name, password/hash, token, child data, counts or invented metrics.
The existing `/auth/register`, `/auth/login`, `/auth/me`, error envelope and CORS
contracts remain unchanged. No permissions over children's data are granted.

## First Admin: manual local procedure

The command is **never executed on startup** and exposes no HTTP endpoint. It
imports no Nest application, Redis or dotenv. It never falls back to DATABASE_URL
or DIRECT_URL. Do not use it on development records as a test. Development,
Supabase and production records were not used for verification.

The original local command supports an explicitly selected **local PostgreSQL**
target only; remote and production targets remain refused by that command. An
independent approved Supabase development procedure is documented below. A local port/tunnel
can still forward to a remote database: the operator must verify actual database
ownership and isolation. Do not use a tunnel or proxy to bypass this boundary.
Production provisioning remains unsupported and requires a separate reviewed operational procedure.

Prerequisites: Node matching backend requirements, installed lockfile dependencies,
generated Prisma Client, existing schema already initialized through the approved
Prisma Migrate workflow. This command never applies migrations. Select the actual
target deliberately; it will insert one ADMIN/ACTIVE record and commit it.

From `backend/`, in a private PowerShell session without transcription:

```powershell
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
$env:NODE_ENV = 'development'
$env:NATIQ_ADMIN_BOOTSTRAP = 'CREATE_FIRST_ADMIN'
$adminConnection = Read-Host 'Explicit local PostgreSQL URL' -AsSecureString
try {
    $env:ADMIN_BOOTSTRAP_DATABASE_URL = [System.Net.NetworkCredential]::new('', $adminConnection).Password
    & ./scripts/bootstrap-admin.ps1
} finally {
    Remove-Item Env:ADMIN_BOOTSTRAP_DATABASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:NATIQ_ADMIN_BOOTSTRAP -ErrorAction SilentlyContinue
    $adminConnection.Dispose()
}
```

The launcher prompts for name/email, then password and confirmation with hidden
input. It sends a UTF-8 JSON object through stdin to
`node dist/admin/bootstrap-command.js`. Never supply credentials as command-line
arguments, committed files or password environment variables. The database URL
is temporarily held in the command's environment and must not be logged. The
password is transiently present in process memory; managed strings cannot be
reliably erased. OS/process access must be limited to trusted operators.

Validation reuses RegisterDto transforms/rules and the authentication 72-byte
UTF-8 limit; bcrypt uses cost 12. A PostgreSQL transaction advisory lock serializes
all copies of this command. Under READ COMMITTED the existence check occurs after
lock acquisition. Any ADMIN, including inactive ADMIN, blocks bootstrap. An
existing case-insensitive email match is refused, never promoted or overwritten.
The command returns only a fixed success/failure message and no credentials,
driver errors or user details. Validation, connection, conflict and transaction
failures cause a nonzero exit. Do not retry blindly if output delivery was lost:
the transaction may already have committed.

No automatic recovery, account deletion or privilege promotion is provided.
If an Admin already exists, use its login. Recovery from inaccessible existing
Admins needs an approved account-recovery process. Advisory locking protects
this bootstrap workflow, not uncoordinated privileged manual database writers.

### Explicit Supabase development procedure

This separate workflow is authorized for an operator-confirmed Supabase **development**
project only. It does not relax `bootstrapDatabaseUrl` or the local command. The
operator must identify the project and declare that it is development; a hostname
alone cannot prove a project's intended use. Never use this procedure for production.

Before any creation, the operator/reviewer must verify read-only: the selected
project, connectivity with certificate verification, the complete current schema,
existing Prisma migration history/checksums, absence of Admin and absence of an
email conflict. Existing accounts are preserved. If migrations are pending, review
their SQL against the actual schema before using Prisma Migrate deploy; this
bootstrap command never applies migrations or rewrites migration history. An
unexpected/unfinished/changed migration blocks the command for separate review.

Prerequisites: the intended backend `.env` contains DATABASE_URL and DIRECT_URL for
the same approved project. Environment overrides take precedence exactly as in
the normal backend configuration. DIRECT_URL must be a direct or session endpoint
on 5432, with no query options; DATABASE_URL may use the transaction endpoint on
6543 and `pgbouncer=true`. Both are pinned to the typed project reference and
Supabase host/user structure. No credentials are accepted in command arguments.

Download the project's CA certificate from the authenticated Supabase Dashboard's
Database Settings. Keep it outside tracked files. The workflow checks that it is
a current CA and supplies it to node-postgres with `rejectUnauthorized: true`,
preserving hostname verification. URL SSL overrides and a globally disabled TLS
verification environment are refused. Do not set `NODE_TLS_REJECT_UNAUTHORIZED=0`
or accept an unverified certificate to make a connection succeed.

After reviewing the code and passing isolated tests, start the normal backend on
its configured local port. From `backend/`, in a private terminal without
transcription, build and invoke:

```powershell
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\bootstrap-supabase-dev.ps1 -CaFile 'C:\path\to\trusted-supabase-ca.crt'
```

The script asks for the exact development project reference, then the explicit
authorization phrase `CREATE_FIRST_ADMIN_IN_DEVELOPMENT`. It first runs
`node dist/admin/supabase-dev-command.js --check`: verified TLS, expected applied
migration/checksum and no existing Admin. This mode performs only SELECT queries
and creates no audit file or user. Only after it passes does the script ask for
the Admin name/email and masked password/confirmation. The password goes through
UTF-8 stdin, never CLI arguments, environment, files or logs. Process-scoped
authorization flags are restored when the launcher exits. Never enter credentials
in chat or commit `.env` or the generated audit files.

The write phase repeats preflight and reuses `createFirstAdmin`: existing DTO
validation, bcrypt cost 12, case-insensitive email conflict refusal, no promotion,
and the same transaction advisory lock across local and development commands.
Concurrent execution can create only one first Admin through these workflows.
Any existing ADMIN, regardless of status, blocks creation. The schema remains
unchanged and public registration continues to create PARENT only.

Before insertion the command exclusively creates an ignored local file
`backend/admin-bootstrap-supabase-<random-id>.log` and synchronously writes/flushes
an audit attempt. Subsequent events contain time, OS operator label, project
reference, outcome, created user ID, role/status and verification booleans only.
No account name/email, password/hash, tokens, connection strings or raw exceptions
are recorded. The OS label identifies the local process owner, not an authenticated
Admin approver. Protect this file using local OS permissions. This operational
record is not a tamper-proof platform audit system or an atomic database audit.

After creation the command verifies exactly one Admin, ADMIN/ACTIVE and a bcrypt
hash matching the provided password without printing it. It then attempts one
normal login against `127.0.0.1:<PORT>`, verifies `/auth/me` matches the created ID
and checks `/admin/overview`. Tokens remain in memory and redirects are refused.
`loginVerified=true` demonstrates that the running backend sees that exact account.
`loginVerified=false` means creation succeeded but the local API check did not;
open the web login and investigate the local backend instead of rerunning bootstrap.

If an error occurs after insertion began, the command reports an uncertain outcome
and records a safe outcome marker where possible. Never assume failure rolled back
the creation: re-check the database read-only and inspect the local audit before any
retry. There is no automatic deletion, account recovery, promotion or password reset.

Implementation files: `supabase-dev-bootstrap.ts` (target/schema/login checks),
`supabase-dev-command.ts` (operator-only orchestration and safe audit), and
`scripts/bootstrap-supabase-dev.ps1` (interactive credentials). The existing
bootstrap business logic and normal authentication APIs are unchanged.

Validation of this addition: 98 backend unit tests, 39 HTTP tests and 7 E2E tests
passed. The E2E writes use only the inspected isolated PostgreSQL/Redis services,
including the existing concurrency, no-promotion and hashing checks. New unit
tests cover the remote target policy, certificate refusal, migration checks and
normal login identity matching with substituted certificate parsing/HTTP replies.
TypeScript, lint, build and affected-file formatting passed; PowerShell syntax
was parsed. Actual read-only preflight also passed on the owner-confirmed
development project using the supplied CA with certificate verification. The
existing migration checksum matched, and no migrations needed applying.
These checks do not imply a manual account was created: the operator must still
enter credentials and inspect the safe creation/login result in the local terminal.

## React and security boundaries

`features/admin/` owns the workspace presentation and response validation. The
existing SessionProvider keeps the token private and exposes authenticated GET
without exposing the token to components. It retains expiry, cancellation,
visibility revalidation and local logout behavior. ADMIN login enters `/admin`
through the existing `/home` destination; Parent/Specialist still enter `/home`.
Anonymous `/admin` visits follow the existing login flow. Non-admin sessions are
redirected to their home without making an Admin request.

Admin content waits for the protected overview response. 401/403 invalidate the
session, transient failures show localized retry, and logout removes protected
content. Language changes do not repeat API calls. Only the locale preference is
persisted; tokens/identity are not stored in browser storage. React route checks
are usability controls, never backend authorization. A role/status change is
observed on the next protected request or tab visibility revalidation; there is
no push revocation or polling. Local logout does not revoke an issued JWT.

UI reuses provisional teal/mint tokens, the existing SVG Mark and the shared
language switcher. The sidebar exposes only Overview. Mobile navigation is an
inline disclosure, with focus returned to its toggle after selection. No modal
focus trap or fake disabled management destinations are introduced. CSS uses
logical borders/spacing for RTL/LTR. Focus indicators, headings, skip navigation,
44px controls and reduced motion follow the existing foundation. No generated
raster illustration was necessary and no external fonts/scripts were added.

## Verification

Backend (from `backend/`):

```powershell
npm.cmd test -- --runInBand
npm.cmd run test:http -- --runInBand
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm.cmd run lint
npm.cmd run build
```

Bootstrap integration is in `test/admin-bootstrap.e2e-spec.ts`. Use only the
inspected isolated containers and environment guards described in
[authentication.md](authentication.md), then run:

```powershell
npm.cmd run test:e2e -- --runInBand
```

Bootstrap integration refuses a preexisting Admin. It deletes only its generated
synthetic emails/IDs. It never resets the database or removes other accounts.
Unit and HTTP tests do not connect to PostgreSQL/Redis. HTTP coverage includes
current database roles, stale claims, inactive/deleted accounts, malformed/missing
JWTs, persistence failure and the existing registration privilege-field rejection.

Web (from `web/`):

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run format:check
npm.cmd run build
$env:NATIQ_WEB_TEST_ORIGIN = 'http://127.0.0.1:5187'
npm.cmd run test:browser
```

Browser tests use controlled HTTP responses and axe, not real database records.
Admin tests cover both languages at 375/768/1024/1440px, keyboard disclosure,
direction, page title, account projection, locale storage and logout. Screenshots
are ignored local artifacts `web/test-results/admin-{ar|en}-{width}.png`.
Automated axe results are not full WCAG certification; manual screen-reader,
Safari/Firefox and production security headers remain separate verification.

### Results recorded for V1

| Check                                        | Result                                                          | Infrastructure                                                    |
| -------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------- |
| Backend unit tests                           | 71 passed                                                       | No external services                                              |
| Backend HTTP tests                           | 39 passed                                                       | Real Nest/JWT, substituted database/security storage              |
| Backend E2E including bootstrap              | 7 passed                                                        | Inspected isolated PostgreSQL and Redis                           |
| Bootstrap command                            | Included in E2E; fixed success output verified                  | Isolated PostgreSQL only                                          |
| Web component tests                          | 58 passed; Admin's 8 also rerun after focus handling            | Controlled fetch                                                  |
| Existing browser authentication              | 12 passed                                                       | Controlled responses/aborts                                       |
| Admin browser tests                          | 8 passed after correcting test selectors/StrictMode assumptions | Edge, controlled responses, axe, both locales and all four widths |
| Real browser API smoke and CORS reproduction | 2 skipped by default                                            | Not rerun against real API                                        |
| TypeScript, lint and builds                  | Passed for both components                                      | Local tooling                                                     |
| Formatting                                   | Web and affected backend/docs passed                            | Prettier                                                          |
| PowerShell launcher                          | Syntax parse passed                                             | Interactive masked prompts not manually exercised                 |

These are local results from separate runs, not evidence of GitHub CI or a full
accessibility audit. The initial Admin browser run exposed ambiguous test locators
and an initial-request count assumption under development StrictMode; both tests
were corrected before all eight Admin cases passed. Four final mobile/desktop
screenshots (Arabic/English) were visually inspected. No raster assets were
generated, no dependency versions changed, and no schema migration was added.
The reviewed existing initial migration was applied only to the empty isolated
test database; no development, Supabase or production database was touched.

Manual walkthrough: start backend with existing reviewed runtime configuration
and explicit WEB_CORS_ORIGINS; start web using `npm.cmd run dev`. Sign in as the
manually provisioned local Admin, verify `/admin` and the actual email, switch
languages, resize, use Tab/Enter on navigation and logout. A page reload should
require login while retaining language. Sign in as a synthetic Parent and visit
`/admin`: the home page should appear and an authenticated direct Admin API
request must return 403. Never publish credentials or use children's records.

## Future roadmap (not implemented)

| Feature                          | Dependencies and work                                                                                | Security and acceptance                                                                                                                                  |
| -------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin invitations                | Reviewed delivery infrastructure; token-hash/expiry/revocation schema, API and invite/accept screens | Active ADMIN only; single-use, duplicate-email and concurrent acceptance tests; no public role injection                                                 |
| Admin account management         | Invitations and audit persistence; status API and confirmation dialogs                               | Current-password reauthentication, mandatory reason, explicit confirmation, transactional last-active-Admin protection; reactivate without hard deletion |
| Audit logs                       | Approved append-only event schema and safe metadata; event writes and paginated viewer               | Actor/action/target/time/reason; transaction consistency; no credentials/tokens/child details; authorization/redaction tests                             |
| Parent and Specialist management | Approved account policies and auditing; scoped APIs and lists                                        | Least privilege, no assumed child-data entitlement; role/status and pagination tests                                                                     |
| Educational content              | Approved content schema/workflow and audits; editor and content APIs                                 | Validation, file safety, accessible bilingual content; publishing permissions tests                                                                      |
| Child learning data governance   | Explicit consent/access/retention decisions before endpoints or schema                               | Separate platform administration from sensitive records; denied-access and data-minimization tests                                                       |
| Platform analytics               | Approved metric definitions and privacy review; aggregate API/UI                                     | Real data only, aggregation leakage controls and correctness tests                                                                                       |
| AI administration                | Approved models/providers/contracts; Nest orchestration and scoped monitoring                        | No direct React-to-FastAPI path; no unapproved children's data sharing; timeout/redaction/authorization tests                                            |

V1 has no invitations, deactivation/reactivation, audit persistence or sensitive
data management. Its only write operation is the deliberately manual bootstrap.
