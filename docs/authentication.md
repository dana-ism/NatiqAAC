# Authentication

For the latest registration, verification and specialist eligibility changes, see
[Authentication and onboarding V3](auth-onboarding-v3.md).
The approved Google Login role selection and signup finalization are documented
in [Google authentication finalization](google-auth-flow-finalization.md).

## Scope and implementation status

Parent registration, password login and protected current-user access are implemented in the NestJS backend. Redis-backed account protection and IP throttling are mandatory for registration/login. Integration against PostgreSQL/Redis must be verified in isolated infrastructure before merge.

Authentication V2 adds email verification, specialist onboarding/review, provider
identities and restricted onboarding sessions. Read the
[V2 contracts, migration and security guide](auth-account-management-v2.md) and
[provider setup](auth-account-v2-providers.md). No refresh tokens, server logout,
token revocation, persistent browser sessions or child permissions were added.
Supabase application requires separate migration/environment/backup review.

## API contract

The approved Admin V1 adds `GET /admin/overview` behind the existing JWT guard
and a current-database-role guard. Existing authentication contracts are preserved.
See [Admin authorization, bootstrap and limitations](admin.md).

JSON bodies are validated using the same global ValidationPipe in application and HTTP tests. Unknown fields are rejected. Passwords are never trimmed, normalized or silently truncated.

| Endpoint            | Authentication                              | Success     |
| ------------------- | ------------------------------------------- | ----------- |
| POST /auth/register | Public; IP throttled                        | 201 Created |
| POST /auth/login    | Public; IP throttled and account protection | 200 OK      |
| GET /auth/me        | Authorization: Bearer <access token>        | 200 OK      |

### Registration

Request fields: fullName (string, trimmed, nonempty, maximum 100 characters), email (valid email, normalized), password (8-72 characters AND at most 72 UTF-8 bytes).

V2 keeps `/auth/register` as a Parent alias. Response: `{ message: 'Email verification required', user: { id, fullName, email, role, status, createdAt }, verification: { emailSent } }`. `createdAt` is an ISO timestamp. Parent accounts retain operational ACTIVE status but cannot gain normal access until verification; new accounts have `legacyAuthExempt=false`. Clients cannot set role/status/verification/exemption. Password/hash are never returned; bcrypt cost remains 12. Registration now checks mail-domain routing and requires a configured `PUBLIC_WEB_ORIGIN`. See the V2 guide for the separate Parent/Specialist routes.

### Login

Request fields: email and password. The same password length constraints apply.

Response: { message: 'Login successful', access_token, user: { id, fullName, email, role, status } }.

Eligible and explicitly exempt legacy accounts retain that response. New accounts
requiring verification or professional approval instead receive `onboarding_token`
and `message: 'Account completion required'`, without `access_token`. That token
is limited to account-completion routes; `/auth/me` rejects it. Flutter callers
must distinguish these alternatives before treating a login as platform access.

Compatibility change: successful login explicitly returns 200, replacing the previous Nest default of 201. Clients must accept 200. Response field names are preserved.

### Current user

Response: { userId, email, role }. This is an identity response, not the complete user profile. Database identity and current ACTIVE status are checked on each protected request. Current database role/email take precedence over token claims.

### Errors

Existing Nest error structures are preserved: statusCode, message (string or validation array), and error when supplied by the standard exception. There is no new global envelope.

| Status | Meaning                                                                                                       |
| ------ | ------------------------------------------------------------------------------------------------------------- |
| 400    | Invalid DTO, unknown fields, empty trimmed name, password beyond UTF-8 byte limit                             |
| 401    | Invalid credentials, ambiguous legacy identity, missing/invalid/expired JWT, absent/inactive user on /auth/me |
| 403    | Correct credentials for a non-ACTIVE account during login                                                     |
| 409    | Duplicate email                                                                                               |
| 429    | IP throttling or account lock                                                                                 |
| 503    | Required Redis protection unavailable                                                                         |
| 500    | Unexpected application or persistence error                                                                   |

Account-lock body: { statusCode: 429, message, retryAfterSeconds }. Retry-After is also set in seconds. The throttling library supplies its own 429 message and Retry-After; clients should not assume both 429 bodies are identical. No credentials, connection strings or tokens are included in failure responses.

## Login protection

Keys retain auth:login:<SHA-256 of normalized email>:failures|stage|lock. Hashing reduces raw-email exposure but is not anonymization. PostgreSQL records are not modified by login protection.

- Five failed credentials within a fixed 60-second window create a lock. The fifth failure returns 429.
- Each subsequent escalation requires five NEW failures after the previous lock expires.
- Durations in seconds: 30, 60, 120, 240, 480, then 900 for all later stages.
- A stage expires 30 minutes after the end of the most recently established lock. Its TTL is lock duration plus 1800 seconds.
- Requests during a live lock do not extend its expiry or stage recovery time.
- Millisecond TTL checks retain protection during the final fractional second.
- A legacy stage without TTL is bounded on first access, using remaining lock time plus the recovery period. The existing lock is preserved. Untouched legacy keys remain unchanged until accessed; no global scan or deletion is performed.
- A persistent lock or invalid stored stage is treated as unexpected invalid state and fails closed; it is not silently repaired or reported as a transport failure.
- Successful authorization atomically checks that no lock exists, then clears this identity's protection state.

Redis Lua serializes check/failure/success transitions. bcrypt, PostgreSQL and signing are not one distributed transaction. The token is constructed before the final Redis authorization and is discarded if that operation fails. No asynchronous step follows finalization before returning the result. A failure serialized AFTER success can begin a new counting window; it does not revoke the already authorized token.

## Redis outage and deadline policy

Both account protection and AuthRateLimitStorage have a 3000 ms operation deadline. A focused AuthRedisModule owns the connection so initial TCP/Redis handshake is bounded too. Offline command queuing is disabled, command queue length is bounded at 100, and automatic reconnect is disabled.

The installed client's command timeout alone does not bound all in-flight responses. On operation deadline, the shared security connection is destroyed to flush pending work. Other requests using that connection also fail closed. Redis may already have executed a submitted command; a timeout is not a rollback and no token is returned on the affected login path.

Transport/timeouts and recognized infrastructure failures become generic HTTP 503. Programming, Lua and invalid-state errors are not reclassified as infrastructure outages. Connection event logs contain a fixed sanitized message. Startup fails when Redis cannot become ready. After a lost connection or deadline, restore Redis and restart the backend; this deliberately favors bounded, predictable failure over unlimited reconnects. No in-memory fallback weakens the limiter.

## Rate limiting

- Register: 5 requests per 60 seconds per IP.
- Login: 20 requests per 60 seconds per IP.
- Counters are separate per handler; rejected DTOs also consume requests because guards run before pipes.
- The installed storage uses a fixed window and blocks an over-limit IP for 60 seconds from the over-limit request. Requests during that block do not extend it. Thus a block can outlast the original counting window.
- Tracker uses request IP; the installed guard normalizes IPv6 addresses. Shared networks may share limits. Reverse-proxy trust must be reviewed for the actual deployment; arbitrary forwarded headers are not trusted by application changes here.

## Email compatibility and limitations

Input identity is trim().toLowerCase(). Dots and plus suffixes are preserved. New registrations store normalized email. Duplicate checks and login queries use Prisma's case-insensitive filter.

A single mixed-case legacy account remains accessible using normalized input, and its stored email is not rewritten. The original stored email remains in responses/JWT for compatibility. If multiple legacy rows match the same normalized identity, login returns generic 401 without selecting one, and registration returns 409. Resolving those collisions is BLOCKED pending owner review; accounts are never merged/deleted automatically. Existing data was not inspected, so whether collisions exist is unknown.

The schema still has a case-sensitive unique constraint. Concurrent NEW registrations through this code store an identical normalized value and are protected by that constraint plus P2002 handling. Other writers/older deployments can still create case variants. Full database-enforced case-insensitive uniqueness and legacy data cleanup require a separately approved schema/data change. Do not claim that guarantee exists today.

A random synthetic dummy bcrypt hash is generated lazily and cached for absent/ambiguous identities. It reduces the main missing-user comparison difference; it does not guarantee identical end-to-end timing or prevent account enumeration through the existing registration conflict contract.

## JWT

- HS256 is explicit on signing and verification; existing JWT_SECRET is unchanged.
- Access tokens last 900 seconds.
- sub must be a UUID before Prisma is called.
- exp must be a safe integer timestamp in the future; missing expiration is rejected.
- email must be a valid string email; role must be a recognized role string.
- Signature and expiry are verified through Passport/JWT. Current authorization identity/status is fetched from PostgreSQL.
- Client-side logout can discard a token but cannot revoke it on the server. Password recovery, rotation, issuer/audience policy and browser/mobile storage decisions remain separate work.

## Environment

Core runtime names: DATABASE_URL, DIRECT_URL (Prisma CLI), REDIS_URL, JWT_SECRET, PORT. V2 adds the public origin, mail, provider and private-storage settings in `.env.example`; see the linked guides. Never commit real environment files.

Optional web integration: WEB_CORS_ORIGINS is a comma-separated list of exact HTTP(S) origins, without paths, wildcards or trailing slashes. Local development uses WEB_CORS_ORIGINS=http://127.0.0.1:5173,http://localhost:5173 to match both explicit Vite origins; these are different origins even when they reach the same machine. Put this value in the backend runtime environment (the example file is not loaded automatically) and restart NestJS after changing it. When unset, CORS remains disabled: the API can be running while a browser preflight receives 404 without CORS headers. Configured origins may use GET/POST with Authorization and Content-Type; Retry-After is exposed to browser code. Credentials/cookies are not enabled. This is browser access configuration, not an authorization mechanism. Use only trusted HTTPS origins in deployed environments.

Test-only names: NATIQ_TEST_ISOLATED, NATIQ_TEST_POSTGRES_PASSWORD, TEST_DATABASE_URL, TEST_REDIS_URL. Test setup generates a synthetic JWT secret and overrides runtime URLs only after validation. It never loads .env or falls back to development URLs. Do not use NODE_ENV=test as the only isolation proof.

## Safe test infrastructure

compose.auth-test.yaml prepares two dedicated localhost services, with container names natiqaac-auth-test-postgres and natiqaac-auth-test-redis, label com.natiqaac.purpose=isolated-auth-tests, PostgreSQL port 55432/database natiqaac_auth_test/user natiqaac_test, and Redis port 56379/database 0. Both use temporary storage; Redis persistence is disabled. No shared development volumes are referenced.

Before starting anything:

1. Ensure Docker Engine is available. Do not stop/recreate/remove existing containers or volumes.
2. Inspect container names and published ports. If either name/port is already used, stop and review ownership instead of reusing it automatically.
3. Set a synthetic test-only password for NATIQ_TEST_POSTGRES_PASSWORD. Use matching TEST_DATABASE_URL and TEST_REDIS_URL from the example template; do not use Supabase endpoints.
4. Create only these new services using docker compose -f compose.auth-test.yaml up -d --no-recreate. This can download images; obtain environment permission where required.
5. Inspect the two containers' labels, loopback-only port mappings and mounts. Confirm that they are the newly created test instances. Set NATIQ_TEST_ISOLATED=YES only after this inspection.
6. On the NEW empty test PostgreSQL database only, initialize the reviewed existing migrations with: node node_modules/prisma/build/index.js migrate deploy --config prisma.auth-test.config.ts.
7. Run Redis/E2E commands below only after isolation and schema setup are verified.

The separate Prisma test config has the same URL safety validator and imports no dotenv. Never run migrate reset, db push, FLUSHDB or FLUSHALL. No test infrastructure was started as part of the implementation when Docker Engine was unavailable.

The safety validator refuses missing explicit attestation, non-local hosts, default/wrong ports, non-test database names, unexpected DB users, query-string overrides and development credentials fallback. Endpoint shape checks cannot prove service ownership; the container inspection and operator attestation are mandatory. Future non-container test infrastructure needs a separate review.

## Verification commands (backend directory)

Use npm.cmd on Windows if PowerShell blocks npm.ps1.

- npm.cmd test -- --runInBand : unit and pure isolation-guard tests, no external connections.
- npm.cmd run test:http -- --runInBand : real Nest HTTP/DTO/bcrypt/JWT/guards with database and Redis substitutes; no development services.
- npm.cmd run test:redis -- --runInBand : real Lua/TTL/concurrency/throttling on isolated Redis only. Explicit test environment is mandatory.
- npm.cmd run test:e2e -- --runInBand : real Register -> Login -> Me using isolated PostgreSQL/Redis and synthetic users.
- npm.cmd run lint
- node node_modules/typescript/bin/tsc --noEmit --incremental false
- npm.cmd run build

Use Prettier --check on changed source/config/docs, excluding generated Prisma source. npm run format writes files and should not be used as a read-only check.

Redis tests assert production durations/TTL, then accelerate expiry only on keys owned by that test to avoid waiting minutes. E2E tracks its synthetic user IDs and Redis keys for scoped cleanup; throttler keys include a run-specific scope on the dedicated instance so repeat runs do not inherit prior IP counters. No global resets are used. Connection and HTTP resources are closed after tests.

Redis/PostgreSQL suites are not considered passed merely because unit/HTTP tests pass. Record their actual results and blockers in the PR.
