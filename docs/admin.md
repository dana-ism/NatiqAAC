# Admin Portal V1

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

This release supports an explicitly selected **local PostgreSQL** target only;
remote and production bootstrap are deliberately refused. A local port/tunnel
can still forward to a remote database: the operator must verify actual database
ownership and isolation. Do not use a tunnel or proxy to bypass this boundary.
Production provisioning requires a separate reviewed operational procedure.

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
